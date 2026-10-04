import { AgentRegistryAbi, KnowledgeGraphAbi, MemorySlotsAbi, hiveDeployment } from "@hive/shared";
import { BaseError, ContractFunctionRevertedError, type Hex, type PublicClient } from "viem";
import { UnknownAgentError, type ChainAgent, type ChainEdge, type ChainReader, type ChainSlot } from "./types.js";

const isUnknownAgentRevert = (e: unknown) =>
  e instanceof BaseError && e.walk((x) => x instanceof ContractFunctionRevertedError && x.data?.errorName === "UnknownAgent") !== null;

// AgentRegistry ids count up from 1 with no gaps and has no per-owner index, so agentsOf walks them in batches.
const SCAN_BATCH = 8n;
const SCAN_MAX = 256n;

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
    const mine: ChainAgent[] = [];
    for (let start = 1n; start <= SCAN_MAX; start += SCAN_BATCH) {
      const ids = Array.from({ length: Number(SCAN_BATCH) }, (_, i) => start + BigInt(i));
      for (const r of await Promise.allSettled(ids.map((id) => this.agent(id)))) {
        if (r.status === "rejected") {
          if (r.reason instanceof UnknownAgentError) return mine;
          throw r.reason;
        }
        if (r.value.owner.toLowerCase() === owner.toLowerCase()) mine.push(r.value);
      }
    }
    return mine;
  }
}
