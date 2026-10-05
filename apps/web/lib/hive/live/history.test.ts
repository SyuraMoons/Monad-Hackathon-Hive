import { HiveError } from "@hive/shared";
import { describe, expect, it, vi } from "vitest";
import { agentHistory, type ChainSlot, type HistoryDeps } from "./history";

const hash = (n: number) => `0x${n.toString(16).padStart(2, "0").repeat(32)}`;
const slot = (id: number, over: Partial<ChainSlot> = {}): ChainSlot => ({ id: BigInt(id), agentId: BigInt(1), contentHash: hash(id), topic: "work", writtenAt: BigInt(1_700_000_000 + id), ...over });
const deps = (slots: ChainSlot[]): HistoryDeps & { slotsSince: ReturnType<typeof vi.fn> } => ({ slotsSince: vi.fn(async () => slots) });

describe("agentHistory", () => {
  it("asks for every slot of the agent and returns them newest first", async () => {
    const d = deps([slot(1), slot(3), slot(2)]);
    const rows = await agentHistory(d, BigInt(1));
    expect(d.slotsSince).toHaveBeenCalledWith(BigInt(1), BigInt(0));
    expect(rows.map((r) => r.slotId)).toEqual([BigInt(3), BigInt(2), BigInt(1)]);
    expect(rows[0]).toMatchObject({ topic: "work", writtenAt: 1_700_000_003 });
  });

  it("breaks a tie on time by the higher slot id", async () => {
    const same = BigInt(1_700_000_000);
    const rows = await agentHistory(deps([slot(1, { writtenAt: same }), slot(2, { writtenAt: same })]), BigInt(1));
    expect(rows.map((r) => r.slotId)).toEqual([BigInt(2), BigInt(1)]);
  });

  it("skips a row whose topic or hash can't be shown", async () => {
    const rows = await agentHistory(deps([slot(1, { topic: "Not A Slug" }), slot(2, { contentHash: "0x12" }), slot(3)]), BigInt(1));
    expect(rows.map((r) => r.slotId)).toEqual([BigInt(3)]);
  });

  it("keeps only the newest rows up to the limit", async () => {
    const rows = await agentHistory(deps(Array.from({ length: 70 }, (_, i) => slot(i + 1))), BigInt(1));
    expect(rows).toHaveLength(50);
    expect(rows[0].slotId).toBe(BigInt(70));
  });

  it("returns an empty list for an agent with no writes", async () => {
    expect(await agentHistory(deps([]), BigInt(1))).toEqual([]);
  });

  it("passes a chain failure on", async () => {
    const failing: HistoryDeps = { slotsSince: vi.fn().mockRejectedValue(new HiveError("CHAIN_ERROR", "down")) };
    await expect(agentHistory(failing, BigInt(1))).rejects.toThrow("down");
  });
});
