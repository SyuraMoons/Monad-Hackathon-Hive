import { HiveError } from "@hive/shared";
import { BaseError, InsufficientFundsError, keccak256, stringToBytes, type Hex } from "viem";
import { describe, expect, it, vi } from "vitest";
import { addEdgeTx, edgesOf, removeEdgeTx, UNKNOWN_TOPIC, type ChainEdge } from "./edges";

const h = (t: string) => keccak256(stringToBytes(t));
const TX = `0x${"ab".repeat(32)}` as Hex;
const edge = (id: number, from: number, to: number, topic: string, over: Partial<ChainEdge> = {}): ChainEdge => ({
  id: BigInt(id), from: BigInt(from), to: BigInt(to), topic: h(topic), expiresAt: BigInt(2_000_000_000), active: true, ...over,
});
const reader = (rows: ChainEdge[]) => ({ edgesFrom: vi.fn(async (id: bigint) => rows.filter((r) => r.from === id)) });

describe("edgesOf", () => {
  it("turns a topic hash back into its text and drops inactive edges", async () => {
    const deps = reader([edge(1, 1, 2, "brain"), edge(2, 1, 3, "brain", { active: false })]);
    const out = await edgesOf(deps, [BigInt(1)], ["brain"], {});
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ edgeId: BigInt(1), from: BigInt(1), to: BigInt(2), topic: "brain", active: true, addedTx: null, removedTx: null, expiresAt: 2_000_000_000 });
  });

  it("reads the edges of every agent", async () => {
    const deps = reader([edge(1, 1, 2, "brain"), edge(2, 2, 1, "brain")]);
    expect(await edgesOf(deps, [BigInt(1), BigInt(2)], ["brain"], {})).toHaveLength(2);
  });

  it("asks for more topics only when an edge is unresolved", async () => {
    const more = vi.fn(async () => ["work"]);
    await edgesOf(reader([edge(1, 1, 2, "brain")]), [BigInt(1)], ["brain"], {}, more);
    expect(more).not.toHaveBeenCalled();
    const out = await edgesOf(reader([edge(1, 1, 2, "work")]), [BigInt(1)], ["brain"], {}, more);
    expect(more).toHaveBeenCalledOnce();
    expect(out[0].topic).toBe("work");
  });

  it("keeps an edge whose topic can't be recovered", async () => {
    const out = await edgesOf(reader([edge(1, 1, 2, "secret-topic")]), [BigInt(1)], ["brain"], {}, async () => { throw new Error("down"); });
    expect(out).toHaveLength(1);
    expect(out[0].topic).toBe(UNKNOWN_TOPIC);
  });

  it("takes the transaction from a note only when its topic is the chain's", async () => {
    const deps = reader([edge(1, 1, 2, "work"), edge(2, 1, 3, "brain")]);
    const notes = { "1": { topic: "work", addedTx: TX }, "2": { topic: "other", addedTx: TX } };
    const out = await edgesOf(deps, [BigInt(1)], ["brain", "work"], notes);
    expect(out.find((e) => e.edgeId === BigInt(1))?.addedTx).toBe(TX);
    expect(out.find((e) => e.edgeId === BigInt(2))?.addedTx).toBeNull();
  });

  it("rejects when the chain can't be read", async () => {
    const deps = { edgesFrom: vi.fn().mockRejectedValue(new HiveError("CHAIN_ERROR", "down")) };
    await expect(edgesOf(deps, [BigInt(1)], [], {})).rejects.toThrow("down");
  });
});

describe("edge transactions", () => {
  const input = { from: BigInt(1), to: BigInt(2), topic: "brain", expiresAt: 2_000_000_000 };

  it("sends the edge with the expiry as a bigint", async () => {
    const add = vi.fn(async () => ({ edgeId: BigInt(5), txHash: TX }));
    expect(await addEdgeTx({ add }, input)).toEqual({ edgeId: BigInt(5), txHash: TX });
    expect(add).toHaveBeenCalledWith(BigInt(1), BigInt(2), "brain", BigInt(2_000_000_000));
  });

  it("explains an account with no MON, without echoing the RPC error", async () => {
    const rpc = new BaseError("insufficient funds for 0xSECRET", { cause: new InsufficientFundsError() });
    const err = (await addEdgeTx({ add: vi.fn().mockRejectedValue(rpc) }, input).catch((e: unknown) => e)) as HiveError;
    expect(err.message).toMatch(/no MON for gas/);
    expect(err.message).not.toContain("SECRET");
  });

  it("hides any other failure behind a fixed message", async () => {
    const add = (await addEdgeTx({ add: vi.fn().mockRejectedValue(new Error("rpc said 0xSECRET")) }, input).catch((e: unknown) => e)) as HiveError;
    expect(add.message).toBe("Could not sign the edge on Monad.");
    const rm = (await removeEdgeTx({ remove: vi.fn().mockRejectedValue(new Error("0xSECRET")) }, BigInt(1)).catch((e: unknown) => e)) as HiveError;
    expect(rm.message).toBe("Could not revoke the edge on Monad.");
  });

  it("passes a HiveError through", async () => {
    const err = new HiveError("CHAIN_ERROR", "The transaction was reverted onchain.");
    await expect(removeEdgeTx({ remove: vi.fn().mockRejectedValue(err) }, BigInt(1))).rejects.toBe(err);
  });
});
