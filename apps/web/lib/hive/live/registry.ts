import { HiveError, zAgentType, type Agent, type AgentType } from "@hive/shared";
import { BaseError, InsufficientFundsError, getAddress, zeroAddress, type Address, type Hex } from "viem";

// AgentRegistry reads and the two-step registration. The chain calls are injected (RegistryDeps), so this file
// has no RPC in it and its tests run against fakes. The real deps are in registryChain.ts.

/** One AgentRegistry row. `writer` is the zero address until setAgentWriter runs. */
export type ChainAgent = { id: bigint; owner: Address; name: string; agentType: string; writer: Address; registeredAt: bigint };

export type RegistryDeps = {
  /** `null` when the id is not registered. Any other failure rejects. */
  readAgent(id: bigint): Promise<ChainAgent | null>;
  /** Sends `register` and resolves with the new id once the receipt is in. */
  register(name: string, agentType: string, agentKey: Hex): Promise<{ agentId: bigint; txHash: Hex }>;
  /** Sends `setAgentWriter` and resolves with its hash once the receipt is in. */
  setWriter(agentId: bigint, writer: Address): Promise<Hex>;
};

// The registry has no per-owner index and ids count up from 1 with no gaps, so walk them in batches until one is missing.
// Same approach as the bridge's ViemChainReader.agentsOf.
const SCAN_BATCH = BigInt(8);
const SCAN_MAX = BigInt(256);

const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function toAgent(a: ChainAgent): Agent {
  const type = zAgentType.safeParse(a.agentType);
  return { agentId: a.id, owner: getAddress(a.owner), agentKey: getAddress(a.writer), name: a.name, agentType: type.success ? type.data : "other", registeredAt: Number(a.registeredAt) };
}

export async function agentsOf(deps: Pick<RegistryDeps, "readAgent">, owner: Address): Promise<ChainAgent[]> {
  const mine: ChainAgent[] = [];
  for (let start = BigInt(1); start <= SCAN_MAX; start += SCAN_BATCH) {
    const ids = Array.from({ length: Number(SCAN_BATCH) }, (_, i) => start + BigInt(i));
    for (const agent of await Promise.all(ids.map((id) => deps.readAgent(id)))) {
      if (!agent) return mine;
      if (sameAddress(agent.owner, owner)) mine.push(agent);
    }
  }
  return mine;
}

// Monad's RPC reports an empty balance as "Signer had insufficient balance" in a generic invalid-params error, not as the
// error viem maps to InsufficientFundsError.
const isOutOfFunds = (x: unknown) =>
  x instanceof InsufficientFundsError || (x instanceof Error && /insufficient (balance|funds)/i.test(`${x.message} ${(x as { details?: string }).details ?? ""}`));

/** Fixed messages only: nothing from the RPC or the signer goes into them. */
function toHiveError(e: unknown): HiveError {
  if (e instanceof HiveError) return e;
  if (e instanceof BaseError && e.walk(isOutOfFunds) !== null) {
    return new HiveError("CHAIN_ERROR", "Your account has no MON for gas. Get test MON from the faucet, then try again.");
  }
  return new HiveError("CHAIN_ERROR", "Could not register the agent on Monad.");
}

/**
 * register, then setAgentWriter (the bridge refuses to authorize an agent without a writer).
 * If an earlier attempt stopped between the two transactions, the owner already has an agent of this type with no
 * writer: reuse it instead of registering a duplicate the Connect page could never finish.
 */
export async function registerAndBind(
  deps: RegistryDeps,
  input: { owner: Address; name: string; agentType: AgentType; agentKey: Address },
): Promise<{ agentId: bigint; txHash: Hex }> {
  try {
    const unbound = (await agentsOf(deps, input.owner)).find((a) => a.agentType === input.agentType && sameAddress(a.writer, zeroAddress));
    // Nothing reads `pubKey` yet (docs/backend-handoff.md §2, #3), so it carries the agent key address.
    const registered = unbound ? { agentId: unbound.id, txHash: undefined } : await deps.register(input.name, input.agentType, input.agentKey);
    const txHash = await deps.setWriter(registered.agentId, input.agentKey);
    return { agentId: registered.agentId, txHash };
  } catch (e) {
    throw toHiveError(e);
  }
}
