import type { AgentId } from "@hive/shared";

/** One KnowledgeGraph.addEdge call. A mutual connection is two of them: the contract has no pair or batch call. */
export type Leg = { from: AgentId; to: AgentId };

export const legsOf = (from: AgentId, to: AgentId, both: boolean): Leg[] => (both ? [{ from, to }, { from: to, to: from }] : [{ from, to }]);

/**
 * Runs the legs one after the other and stops at the first failure, so a failed leg never leaves a later one signed.
 * Sequential on purpose: the signer sends from one account, and the next transaction waits for the receipt of the last.
 */
export async function runLegs<T extends { status: "confirmed" | "failed" }>(
  legs: Leg[],
  run: (leg: Leg, index: number) => Promise<T>,
): Promise<{ results: T[]; failedAt: number | null }> {
  const results: T[] = [];
  for (const [i, leg] of legs.entries()) {
    const result = await run(leg, i);
    results.push(result);
    if (result.status !== "confirmed") return { results, failedAt: i };
  }
  return { results, failedAt: null };
}
