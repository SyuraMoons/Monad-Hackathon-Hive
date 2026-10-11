// Pure helpers: no Envio imports, so they are unit-tested directly.

/** `EdgeAdded` emits the plain topic text, and an all-topics edge is stored as "*" (ADR-013). */
export const ALL_TOPICS = "*";

export type EdgeLike = { id: string; toAgent: string; topic: string; expiresAt: number; active: boolean };

/** Same test as `PropagationEngine.onMemoryWritten`: active, topic equal or "*", `expiresAt > now`. */
export const edgeCovers = (edge: EdgeLike, target: { toAgent: string; topic: string; at: number }): boolean =>
  edge.active && edge.toAgent === target.toAgent && (edge.topic === target.topic || edge.topic === ALL_TOPICS) && edge.expiresAt > target.at;

/**
 * The edge a `Propagate` log belongs to. The contract emits one log per matching edge, so duplicates
 * (two edges from A to B on the same topic) each get their own: edges already credited in this tx are skipped.
 */
export function pickEdge<E extends EdgeLike>(edges: readonly E[], target: { toAgent: string; topic: string; at: number }, used: ReadonlySet<string>): E | undefined {
  return [...edges]
    .filter((e) => !used.has(e.id) && edgeCovers(e, target))
    .sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0))[0];
}

export const auditId = {
  agent: (agentId: string) => `agent.registered:${agentId}`,
  edgeAdded: (edgeId: string) => `edge.added:${edgeId}`,
  edgeRemoved: (edgeId: string) => `edge.removed:${edgeId}`,
  written: (slotId: string) => `memory.written:${slotId}`,
  propagated: (txHash: string, logIndex: number) => `memory.propagated:${txHash}:${logIndex}`,
};

export const topicStatsId = (owner: string, topic: string) => `${owner}:${topic}`;
