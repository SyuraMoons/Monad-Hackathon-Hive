import { describe, expect, it } from "vitest";
import type { FeedRow } from "@/lib/stores/feed";
import { historyEntries } from "./memoryHistory";
import type { MemoryHistoryRow } from "./types";

const hash = (n: number) => `0x${n.toString(16).padStart(2, "0").repeat(32)}` as MemoryHistoryRow["contentHash"];
const past = (id: number, over: Partial<MemoryHistoryRow> = {}) => ({ slotId: BigInt(id), topic: "work", contentHash: hash(id), writtenAt: 1_700_000_000 + id, ...over }) as MemoryHistoryRow;
const written = (id: number, agentId = 1, propagatedTo: number[] = []) =>
  ({ kind: "written", id: `e${id}`, at: 1_700_000_000 + id, agentId: BigInt(agentId), topic: "work", slotId: BigInt(id), contentHash: hash(id), txHash: hash(id), propagatedTo: propagatedTo.map(BigInt) }) as unknown as FeedRow;

describe("historyEntries", () => {
  it("merges chain rows and live writes, newest first, numbered from the oldest", () => {
    const entries = historyEntries([past(2), past(1)], [written(3)], BigInt(1));
    expect(entries.map((e) => [e.n, e.slotId])).toEqual([[3, BigInt(3)], [2, BigInt(2)], [1, BigInt(1)]]);
  });

  it("keeps one row per slot, and the live row says who the write reached", () => {
    const entries = historyEntries([past(1)], [written(1, 1, [2])], BigInt(1));
    expect(entries).toHaveLength(1);
    expect(entries[0].propagatedTo).toEqual([BigInt(2)]);
  });

  it("ignores other agents' writes and rows that are not writes", () => {
    const read = { kind: "read", id: "r", at: 1, readerAgentId: BigInt(1), fromAgentIds: [], count: 0 } as FeedRow;
    expect(historyEntries([], [written(1, 2), read], BigInt(1))).toEqual([]);
  });

  it("does not renumber older writes when a newer one arrives", () => {
    const before = historyEntries([past(2), past(1)], [], BigInt(1));
    const after = historyEntries([past(2), past(1)], [written(3)], BigInt(1));
    for (const e of before) expect(after.find((a) => a.slotId === e.slotId)?.n).toBe(e.n);
  });

  it("breaks a tie on time by the higher slot id", () => {
    const entries = historyEntries([past(1, { writtenAt: 5 }), past(2, { writtenAt: 5 })], [], BigInt(1));
    expect(entries.map((e) => e.slotId)).toEqual([BigInt(2), BigInt(1)]);
  });

  it("shows only live writes while the chain history is loading, failed or missing", () => {
    for (const state of ["loading", "error", undefined] as const) expect(historyEntries(state, [written(4)], BigInt(1)).map((e) => e.n)).toEqual([1]);
  });
});
