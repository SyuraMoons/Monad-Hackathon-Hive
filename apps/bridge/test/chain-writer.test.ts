import { HiveError, MemorySlotsAbi, PropagationEngineAbi, hiveDeployment, type Hex } from "@hive/shared";
import { BaseError, InsufficientFundsError, encodeAbiParameters, encodeEventTopics } from "viem";
import { describe, expect, it } from "vitest";
import { ViemChainWriter } from "../src/chain.js";

const KEY = ("0x" + "11".repeat(32)) as Hex;
const HASH = ("0x" + "ab".repeat(32)) as Hex;
const TX = ("0x" + "cc".repeat(32)) as Hex;

const writtenLog = (slotId: bigint, address: string = hiveDeployment.memorySlots) => ({
  address,
  topics: encodeEventTopics({ abi: MemorySlotsAbi, eventName: "MemoryWritten", args: { slotId, agentId: 1n, contentHash: HASH } }),
  data: encodeAbiParameters([{ type: "string" }, { type: "uint256" }], ["work", 100n]),
});
const propagateLog = (to: bigint, address: string = hiveDeployment.propagationEngine) => ({
  address,
  topics: encodeEventTopics({ abi: PropagationEngineAbi, eventName: "Propagate", args: { from: 1n, to, contentHash: HASH } }),
  data: encodeAbiParameters([{ type: "string" }, { type: "uint256" }], ["work", 100n]),
});

function setup(opts: { estimate?: bigint; status?: "success" | "reverted"; logs?: object[] } = {}) {
  const seen: { gas?: bigint; calls: number } = { calls: 0 };
  const writer = new ViemChainWriter({
    estimate: async () => opts.estimate ?? 100_000n,
    submit: async (_key, call) => { seen.gas = call.gas; seen.calls++; return TX; },
    receipt: async () => ({ status: opts.status ?? "success", logs: (opts.logs ?? [writtenLog(7n), propagateLog(2n), propagateLog(3n)]) as never }),
  });
  return { writer, seen };
}
const args = { agentKey: KEY, agentId: 1n, contentHash: HASH, topic: "work" };

describe("ViemChainWriter", () => {
  it("returns the slot and the propagation targets from the receipt logs", async () => {
    const { writer } = setup();
    expect(await writer.write(args)).toEqual({ txHash: TX, slotId: 7n, propagatedTo: [2n, 3n] });
  });

  it("reports an empty propagation list when no edge matched", async () => {
    const { writer } = setup({ logs: [writtenLog(8n)] });
    expect((await writer.write(args)).propagatedTo).toEqual([]);
  });

  it("ignores logs that come from any other contract address", async () => {
    const fake = "0x00000000000000000000000000000000000000ff";
    const { writer } = setup({ logs: [writtenLog(7n), propagateLog(9n, fake)] });
    expect((await writer.write(args)).propagatedTo).toEqual([]);
    const { writer: none } = setup({ logs: [writtenLog(7n, fake)] });
    await expect(none.write(args)).rejects.toMatchObject({ code: "CHAIN_ERROR" });
  });

  it("lists a target once even if two edges matched", async () => {
    const { writer } = setup({ logs: [writtenLog(7n), propagateLog(2n), propagateLog(2n)] });
    expect((await writer.write(args)).propagatedTo).toEqual([2n]);
  });

  it("sets an explicit gas limit: estimate plus 25%, within 100k to 2M", async () => {
    const mid = setup({ estimate: 200_000n });
    await mid.writer.write(args);
    expect(mid.seen.gas).toBe(250_000n);
    const low = setup({ estimate: 10_000n });
    await low.writer.write(args);
    expect(low.seen.gas).toBe(100_000n);
    const high = setup({ estimate: 9_000_000n });
    await high.writer.write(args);
    expect(high.seen.gas).toBe(2_000_000n);
  });

  it("a reverted transaction is a CHAIN_ERROR", async () => {
    const { writer } = setup({ status: "reverted" });
    await expect(writer.write(args)).rejects.toMatchObject({ code: "CHAIN_ERROR" });
  });

  it("an agent key without MON gets a clear message", async () => {
    const writer = new ViemChainWriter({
      estimate: async () => 100_000n,
      submit: async () => { throw new BaseError("send failed", { cause: new InsufficientFundsError({ cause: new BaseError("inner") }) }); },
      receipt: async () => ({ status: "success", logs: [] }),
    });
    const err = await writer.write(args).catch((e) => e);
    expect(err).toBeInstanceOf(HiveError);
    expect(err.message).toMatch(/no MON|MON for gas/i);
  });

  it("lets other failures out unchanged for the caller to wrap", async () => {
    const writer = new ViemChainWriter({
      estimate: async () => { throw new Error("rpc down"); },
      submit: async () => TX,
      receipt: async () => ({ status: "success", logs: [] }),
    });
    await expect(writer.write(args)).rejects.toThrow("rpc down");
  });
});
