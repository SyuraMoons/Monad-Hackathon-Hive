import type { EvmOnEventContext } from "envio";
import { topicStatsId } from "./lib.js";

type Ctx = EvmOnEventContext;
type Deltas<K extends string> = Partial<Record<K, number>>;

/** Adds `delta` to numeric counters, creating the row at zero first. */
const add = <T extends Record<string, unknown>>(row: T, delta: Record<string, number | undefined>): T => {
  const next: Record<string, unknown> = { ...row };
  for (const [k, d] of Object.entries(delta)) if (d) next[k] = (row[k] as number) + d;
  return next as T;
};

export async function bumpOwner(context: Ctx, owner: string, delta: Deltas<"agents" | "edgesAdded" | "edgesRevoked" | "memories" | "propagations" | "violations">) {
  const row = await context.OwnerStats.getOrCreate({ id: owner, agents: 0, edgesAdded: 0, edgesRevoked: 0, memories: 0, propagations: 0, violations: 0 });
  context.OwnerStats.set(add(row, delta));
}

export async function bumpTopic(context: Ctx, owner: string, topic: string, delta: Deltas<"edges" | "writes" | "propagations">) {
  const row = await context.TopicStats.getOrCreate({ id: topicStatsId(owner, topic), owner, topic, edges: 0, writes: 0, propagations: 0 });
  context.TopicStats.set(add(row, delta));
}

export async function bumpAgent(context: Ctx, agentId: string, delta: Deltas<"writes" | "received" | "edgesOut" | "edgesIn">, at?: number) {
  const row = await context.AgentStats.get(agentId);
  if (!row) return;
  context.AgentStats.set({ ...add(row, delta), lastActiveAt: at ?? row.lastActiveAt });
}
