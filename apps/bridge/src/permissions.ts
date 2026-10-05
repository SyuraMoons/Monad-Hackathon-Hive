import { zTopic } from "@hive/shared";
import { keccak256, stringToBytes } from "viem";
import type { ChainEdge, ChainSlot } from "./types.js";

// Access control is deterministic code (golden rule 3): no LLM, no heuristics. Default deny:
// anything that is not an exact, active, unexpired edge for this reader, sender and topic is refused.

export const topicHash = (topic: string) => keccak256(stringToBytes(topic));

/** Same rule as KnowledgeGraph.hasPermission: active, not expired (`expiresAt > now`), matching sender, reader and topic. */
export function edgeAllows(edge: ChainEdge, q: { from: bigint; to: bigint; topic: string; now: bigint }): boolean {
  return edge.active && edge.from === q.from && edge.to === q.to && edge.expiresAt > q.now && edge.topicHash.toLowerCase() === topicHash(q.topic).toLowerCase();
}

/** Slots the reader may see, given its incoming edges. Never throws: any doubt means the slot is dropped. */
export function permittedSlots(args: { reader: bigint; edges: readonly ChainEdge[]; slots: readonly ChainSlot[]; now: bigint; topic?: string }): ChainSlot[] {
  try {
    return args.slots.filter((slot) => {
      if (!zTopic.safeParse(slot.topic).success) return false;
      if (args.topic !== undefined && slot.topic !== args.topic) return false;
      if (slot.agentId === args.reader) return false;
      return args.edges.some((edge) => edgeAllows(edge, { from: slot.agentId, to: args.reader, topic: slot.topic, now: args.now }));
    });
  } catch {
    return [];
  }
}
