import { parseEther, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { ViemGasFunder } from "../src/funder.js";

const OWNER = "0x00000000000000000000000000000000000000a1";
const A1 = "0x0000000000000000000000000000000000000b01" as Hex;
const A2 = "0x0000000000000000000000000000000000000b02" as Hex;

function setup(balance = 0n) {
  const state = { failSend: false };
  const sent: Array<{ to: Hex; value: bigint }> = [];
  let clock = 1_000_000;
  const funder = new ViemGasFunder({
    getBalance: async () => balance,
    send: async (to, value) => {
      if (state.failSend) throw new Error("send failed");
      sent.push({ to, value });
    },
    now: () => clock,
  });
  return { funder, sent, state, advance: (s: number) => { clock += s; } };
}

describe("ViemGasFunder", () => {
  it("sends 0.1 MON when the agent key is below 0.05 MON", async () => {
    const { funder, sent } = setup(parseEther("0.01"));
    expect(await funder.ensureFunded(OWNER, A1)).toBe("funded");
    expect(sent).toEqual([{ to: A1, value: parseEther("0.1") }]);
  });

  it("does nothing when the balance is already enough", async () => {
    const { funder, sent } = setup(parseEther("0.05"));
    expect(await funder.ensureFunded(OWNER, A1)).toBe("enough");
    expect(sent).toEqual([]);
  });

  it("stops at 0.2 MON per agent", async () => {
    const { funder, sent } = setup(0n);
    expect(await funder.ensureFunded(OWNER, A1)).toBe("funded");
    expect(await funder.ensureFunded(OWNER, A1)).toBe("funded");
    expect(await funder.ensureFunded(OWNER, A1)).toBe("capped");
    expect(sent).toHaveLength(2);
  });

  it("stops at 0.5 MON per owner per day, and the window resets after 24 h", async () => {
    const { funder, sent, advance } = setup(0n);
    const agents = [1, 2, 3, 4, 5, 6].map((n) => `0x00000000000000000000000000000000000000c${n}` as Hex);
    const results = [];
    for (const a of agents) results.push(await funder.ensureFunded(OWNER, a));
    expect(results).toEqual(["funded", "funded", "funded", "funded", "funded", "capped"]);
    advance(24 * 60 * 60);
    expect(await funder.ensureFunded(OWNER, agents[5]!)).toBe("funded");
    expect(sent).toHaveLength(6);
  });

  it("counts a failed send as nothing spent, and lets the error out", async () => {
    const { funder, sent, state } = setup(0n);
    state.failSend = true;
    await expect(funder.ensureFunded(OWNER, A2)).rejects.toThrow("send failed");
    state.failSend = false;
    // The failed attempt must not have used up the 0.2 MON agent cap.
    expect(await funder.ensureFunded(OWNER, A2)).toBe("funded");
    expect(await funder.ensureFunded(OWNER, A2)).toBe("funded");
    expect(sent).toHaveLength(2);
  });
});
