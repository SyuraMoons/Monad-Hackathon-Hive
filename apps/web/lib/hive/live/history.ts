import { zContentHash, zSlotId, zTopic } from "@hive/shared";
import type { MemoryHistoryRow } from "../types";

// An agent's past writes, read from MemorySlots. The chain call is injected (HistoryDeps), so this file has no RPC in it.
// The chain keeps hashes and topics only: there is no content here, and no transaction hash (slots do not store one).

/** One MemorySlots row. */
export type ChainSlot = { id: bigint; agentId: bigint; contentHash: string; topic: string; writtenAt: bigint };

export type HistoryDeps = {
  /** MemorySlots.slotsSince(agentId, since). Rejects when the chain can't be read. */
  slotsSince(agentId: bigint, since: bigint): Promise<ChainSlot[]>;
};

export const HISTORY_LIMIT = 50;

/** Newest first. A row whose topic or hash doesn't parse is skipped: nothing else in the app could show it. */
export async function agentHistory(deps: HistoryDeps, agentId: bigint, limit = HISTORY_LIMIT): Promise<MemoryHistoryRow[]> {
  const rows: MemoryHistoryRow[] = [];
  for (const s of await deps.slotsSince(agentId, BigInt(0))) {
    const topic = zTopic.safeParse(s.topic);
    const contentHash = zContentHash.safeParse(s.contentHash);
    if (!topic.success || !contentHash.success) continue;
    rows.push({ slotId: zSlotId.parse(s.id.toString()), topic: topic.data, contentHash: contentHash.data, writtenAt: Number(s.writtenAt) });
  }
  return rows.sort((a, b) => b.writtenAt - a.writtenAt || (b.slotId > a.slotId ? 1 : -1)).slice(0, limit);
}
