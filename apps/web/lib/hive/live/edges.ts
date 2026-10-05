import { HiveError, type Topic } from "@hive/shared";
import { BaseError, keccak256, stringToBytes, type Hex } from "viem";
import type { EdgeRow } from "../types";
import type { EdgeNote } from "../edgeNotes";
import { isOutOfFunds } from "./registry";

// KnowledgeGraph reads and writes. The chain calls are injected (EdgeDeps), so this file has no RPC in it and its tests
// run against fakes. The real deps are in edgesChain.ts.

/** One KnowledgeGraph row. `topic` is keccak256(topic): the chain keeps no topic text. */
export type ChainEdge = { id: bigint; from: bigint; to: bigint; topic: Hex; expiresAt: bigint; active: boolean };

export type EdgeDeps = {
  edgesFrom(agentId: bigint): Promise<ChainEdge[]>;
  /** Sends `addEdge` and resolves with the new id once the receipt is in. */
  add(from: bigint, to: bigint, topic: string, expiresAt: bigint): Promise<{ edgeId: bigint; txHash: Hex }>;
  /** Sends `removeEdge` and resolves with its hash once the receipt is in. */
  remove(edgeId: bigint): Promise<Hex>;
};

/** Shown for a live edge whose topic can't be recovered. It is still drawn and can still be revoked. */
export const UNKNOWN_TOPIC = "unknown" as Topic;

const hashOf = (topic: string) => keccak256(stringToBytes(topic));

function resolver(topics: Iterable<string>) {
  const byHash = new Map<string, string>();
  for (const t of topics) byHash.set(hashOf(t), t);
  return byHash;
}

/**
 * The active edges the owner's agents send. Topic text comes from `known` first (the "brain" topic and the edges this
 * browser signed). Only when some edge is still unresolved, `more` is asked for further candidates (the topics the agents
 * wrote to). An edge whose topic is still unknown is kept, because a live permission must not be hidden.
 */
export async function edgesOf(
  deps: Pick<EdgeDeps, "edgesFrom">,
  agentIds: bigint[],
  known: string[],
  notes: Record<string, EdgeNote>,
  more?: () => Promise<string[]>,
): Promise<EdgeRow[]> {
  const chain = (await Promise.all(agentIds.map((id) => deps.edgesFrom(id)))).flat().filter((e) => e.active);
  let byHash = resolver(known);
  if (more && chain.some((e) => !byHash.has(e.topic.toLowerCase()))) {
    byHash = resolver([...known, ...(await more().catch(() => []))]);
  }
  return chain.map((e) => {
    const topic = byHash.get(e.topic.toLowerCase());
    const note = notes[e.id.toString()];
    return {
      edgeId: e.id,
      from: e.from,
      to: e.to,
      topic: (topic ?? UNKNOWN_TOPIC) as Topic,
      expiresAt: Number(e.expiresAt),
      active: true,
      // The note only counts when its topic is the one the chain holds for this edge.
      addedTx: note && hashOf(note.topic) === e.topic.toLowerCase() ? (note.addedTx.toLowerCase() as EdgeRow["addedTx"]) : null,
      removedTx: null,
    };
  });
}

/** Fixed messages only: nothing from the RPC or the signer goes into them. */
function toHiveError(e: unknown, fallback: string): HiveError {
  if (e instanceof HiveError) return e;
  if (e instanceof BaseError && e.walk(isOutOfFunds) !== null) {
    return new HiveError("CHAIN_ERROR", "Your account has no MON for gas. Get test MON from the faucet, then try again.");
  }
  return new HiveError("CHAIN_ERROR", fallback);
}

export async function addEdgeTx(deps: Pick<EdgeDeps, "add">, input: { from: bigint; to: bigint; topic: string; expiresAt: number }) {
  try {
    return await deps.add(input.from, input.to, input.topic, BigInt(input.expiresAt));
  } catch (e) {
    throw toHiveError(e, "Could not sign the edge on Monad.");
  }
}

export async function removeEdgeTx(deps: Pick<EdgeDeps, "remove">, edgeId: bigint) {
  try {
    return await deps.remove(edgeId);
  } catch (e) {
    throw toHiveError(e, "Could not revoke the edge on Monad.");
  }
}
