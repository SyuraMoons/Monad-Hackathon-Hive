import { AgentRegistryAbi, HiveError, KnowledgeGraphAbi, MemorySlotsAbi, PropagationEngineAbi, hiveDeployment, monadTestnet, rateLimitedFetch } from "@hive/shared";
import { BaseError, ContractFunctionRevertedError, InsufficientFundsError, createWalletClient, http, parseEventLogs, type Hex, type Log, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { UnknownAgentError, type ChainAgent, type ChainEdge, type ChainReader, type ChainSlot, type ChainWriter, type WriteReceipt } from "./types.js";

const isUnknownAgentRevert = (e: unknown) =>
  e instanceof BaseError && e.walk((x) => x instanceof ContractFunctionRevertedError && x.data?.errorName === "UnknownAgent") !== null;

/**
 * Live Monad testnet state. Nothing is cached: a revoked edge must block the very next read, so every call hits the RPC.
 * Errors propagate on purpose; `readMemory` turns any failure into default deny.
 */
export class ViemChainReader implements ChainReader {
  constructor(private client: Pick<PublicClient, "readContract">) {}

  async edgesTo(agentId: bigint): Promise<ChainEdge[]> {
    const edges = await this.client.readContract({ address: hiveDeployment.knowledgeGraph, abi: KnowledgeGraphAbi, functionName: "edgesTo", args: [agentId] });
    return edges.map((e) => ({ id: e.id, from: e.from, to: e.to, topicHash: e.topic, expiresAt: e.expiresAt, active: e.active }));
  }

  async slotsSince(agentId: bigint, since: bigint): Promise<ChainSlot[]> {
    const slots = await this.client.readContract({ address: hiveDeployment.memorySlots, abi: MemorySlotsAbi, functionName: "slotsSince", args: [agentId, since] });
    return slots.map((s) => ({ id: s.id, agentId: s.agentId, contentHash: s.contentHash, topic: s.topic, writtenAt: s.writtenAt }));
  }

  async agent(agentId: bigint): Promise<ChainAgent> {
    try {
      const a = await this.client.readContract({ address: hiveDeployment.agentRegistry, abi: AgentRegistryAbi, functionName: "agents", args: [agentId] });
      return { id: agentId, name: a.name, owner: a.owner, agentType: a.agentType, writer: a.writer };
    } catch (e) {
      if (isUnknownAgentRevert(e)) throw new UnknownAgentError(agentId);
      throw e;
    }
  }

  async agentsOf(owner: Hex): Promise<ChainAgent[]> {
    const [ids, list] = await this.client.readContract({ address: hiveDeployment.agentRegistry, abi: AgentRegistryAbi, functionName: "agentsOf", args: [owner] });
    return list.map((a, i) => ({ id: ids[i]!, name: a.name, owner: a.owner, agentType: a.agentType, writer: a.writer }));
  }
}

// Gas for MemorySlots.write grows with the sender's outgoing edges. Monad charges the declared limit, so use the
// estimate plus a margin instead of a big fixed number. Placeholder until AK-11 publishes measured limits.
const GAS_MARGIN_PCT = 125n;
const GAS_MIN = 100_000n;
const GAS_MAX = 2_000_000n;

type WriteCall = { agentId: bigint; contentHash: Hex; topic: string };

type WriterDeps = {
  estimate(agentKey: Hex, call: WriteCall): Promise<bigint>;
  submit(agentKey: Hex, call: WriteCall & { gas: bigint }): Promise<Hex>;
  receipt(hash: Hex): Promise<{ status: "success" | "reverted"; logs: Log[] }>;
};

const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export class ViemChainWriter implements ChainWriter {
  constructor(private deps: WriterDeps) {}

  async write({ agentKey, ...call }: { agentKey: Hex } & WriteCall): Promise<WriteReceipt> {
    try {
      const estimate = await this.deps.estimate(agentKey, call);
      const gas = (estimate * GAS_MARGIN_PCT) / 100n;
      const txHash = await this.deps.submit(agentKey, { ...call, gas: gas < GAS_MIN ? GAS_MIN : gas > GAS_MAX ? GAS_MAX : gas });
      const receipt = await this.deps.receipt(txHash);
      if (receipt.status !== "success") throw new HiveError("CHAIN_ERROR", "The memory write was reverted onchain.");

      // Only logs from our own contracts count: anyone can emit a lookalike event from another address.
      const written = parseEventLogs({ abi: MemorySlotsAbi, eventName: "MemoryWritten", logs: receipt.logs }).find((l) => sameAddress(l.address, hiveDeployment.memorySlots));
      if (!written) throw new HiveError("CHAIN_ERROR", "The write receipt has no memory slot.");
      const propagatedTo: bigint[] = [];
      for (const l of parseEventLogs({ abi: PropagationEngineAbi, eventName: "Propagate", logs: receipt.logs })) {
        if (sameAddress(l.address, hiveDeployment.propagationEngine) && !propagatedTo.includes(l.args.to)) propagatedTo.push(l.args.to);
      }
      return { txHash, slotId: written.args.slotId, propagatedTo };
    } catch (e) {
      if (e instanceof HiveError) throw e;
      if (e instanceof BaseError && e.walk((x) => x instanceof InsufficientFundsError) !== null) throw new HiveError("CHAIN_ERROR", "The agent key has no MON for gas.");
      throw e;
    }
  }
}

export function viemChainWriter(rpc: Pick<PublicClient, "estimateContractGas" | "waitForTransactionReceipt">, rpcUrl: string): ChainWriter {
  const args = (c: WriteCall) => [c.agentId, c.contentHash, c.topic] as const;
  return new ViemChainWriter({
    estimate: (key, call) => rpc.estimateContractGas({ account: privateKeyToAccount(key), address: hiveDeployment.memorySlots, abi: MemorySlotsAbi, functionName: "write", args: args(call) }),
    submit: (key, call) => {
      const wallet = createWalletClient({ account: privateKeyToAccount(key), chain: monadTestnet, transport: http(rpcUrl, { fetchFn: rateLimitedFetch }) });
      return wallet.writeContract({ address: hiveDeployment.memorySlots, abi: MemorySlotsAbi, functionName: "write", args: args(call), gas: call.gas });
    },
    receipt: async (hash) => {
      const r = await rpc.waitForTransactionReceipt({ hash, timeout: 30_000 });
      return { status: r.status, logs: r.logs };
    },
  });
}
