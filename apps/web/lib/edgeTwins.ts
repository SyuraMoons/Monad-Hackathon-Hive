import type { AgentId } from "@hive/shared";

type Twinable = { key: string; from: AgentId; to: AgentId; topic: string; state: string; edgeId: bigint | null };

/**
 * The live, signed edges with this from, to and topic, oldest id first. The contract keeps no uniqueness, so an owner
 * can have more than one, and each grants the read on its own: replacing or revoking one edge has to take them all.
 * A pending or revoking edge is not in the list, it is already in flight.
 */
export function twinsOf<E extends Twinable>(edges: Iterable<E>, of: { from: AgentId; to: AgentId; topic: string }): E[] {
  const out: E[] = [];
  for (const e of edges) {
    if (e.state === "signed" && typeof e.edgeId === "bigint" && e.from === of.from && e.to === of.to && e.topic === of.topic) out.push(e);
  }
  return out.sort((a, b) => (a.edgeId! < b.edgeId! ? -1 : a.edgeId! > b.edgeId! ? 1 : 0));
}
