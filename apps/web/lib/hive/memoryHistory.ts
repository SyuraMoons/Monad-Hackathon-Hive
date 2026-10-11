import type { ContentHash } from "@hive/shared";
import type { FeedRow } from "@/lib/stores/feed";
import type { MemoryHistoryRow } from "./types";

/** One write of an agent. `n` counts from the oldest write that is loaded (1), so a newer write never renumbers the others. */
export type HistoryEntry = { n: number; slotId: bigint; topic: string; contentHash: ContentHash; at: number; propagatedTo?: bigint[] };

/** Chain history and this session's live writes, one row per slot, newest first. Live rows know who the write reached. */
export function historyEntries(past: MemoryHistoryRow[] | "loading" | "error" | undefined, rows: FeedRow[], agentId: bigint): HistoryEntry[] {
  const bySlot = new Map<string, Omit<HistoryEntry, "n">>();
  if (Array.isArray(past)) for (const h of past) bySlot.set(h.slotId.toString(), { slotId: h.slotId, topic: h.topic, contentHash: h.contentHash, at: h.writtenAt });
  for (const r of rows) {
    if (r.kind === "written" && r.agentId === agentId) bySlot.set(r.slotId.toString(), { slotId: r.slotId, topic: r.topic, contentHash: r.contentHash, at: r.at, propagatedTo: r.propagatedTo });
  }
  const sorted = [...bySlot.values()].sort((a, b) => b.at - a.at || (b.slotId > a.slotId ? 1 : -1));
  return sorted.map((e, i) => ({ ...e, n: sorted.length - i }));
}
