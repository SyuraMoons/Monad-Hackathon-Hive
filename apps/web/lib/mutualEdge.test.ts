import { describe, expect, it, vi } from "vitest";
import { legsOf, runLegs } from "./mutualEdge";

const A = BigInt(1);
const B = BigInt(2);

describe("legsOf", () => {
  it("is one leg for one direction", () => {
    expect(legsOf(A, B, false)).toEqual([{ from: A, to: B }]);
  });

  it("adds the reverse leg after the one the user drew", () => {
    expect(legsOf(A, B, true)).toEqual([{ from: A, to: B }, { from: B, to: A }]);
  });
});

describe("runLegs", () => {
  const ok = { status: "confirmed" as const };
  const bad = { status: "failed" as const };

  it("runs the legs in order, one at a time", async () => {
    const order: string[] = [];
    let running = 0;
    const out = await runLegs(legsOf(A, B, true), async (leg, i) => {
      running++;
      expect(running).toBe(1);
      order.push(`${leg.from}-${leg.to}#${i}`);
      await Promise.resolve();
      running--;
      return ok;
    });
    expect(order).toEqual(["1-2#0", "2-1#1"]);
    expect(out).toEqual({ results: [ok, ok], failedAt: null });
  });

  it("stops at the first failure and never starts the next leg", async () => {
    const run = vi.fn(async () => bad);
    const out = await runLegs(legsOf(A, B, true), run);
    expect(run).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ results: [bad], failedAt: 0 });
  });

  it("reports a failure of the second leg with the first result kept", async () => {
    const run = vi.fn().mockResolvedValueOnce(ok).mockResolvedValueOnce(bad);
    const out = await runLegs(legsOf(A, B, true), run);
    expect(out).toEqual({ results: [ok, bad], failedAt: 1 });
  });
});
