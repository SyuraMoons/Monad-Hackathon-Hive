import { describe, expect, it } from "vitest";
import { hasReverse, labelTransform, lineShift, normal, PAIR_SHIFT } from "./edgeGeometry";

const edge = (from: number, to: number, state = "signed") => ({ from: BigInt(from), to: BigInt(to), state });

describe("hasReverse", () => {
  it("finds a live edge the other way", () => {
    expect(hasReverse([edge(2, 1)], edge(1, 2))).toBe(true);
    expect(hasReverse([edge(2, 1, "pending")], edge(1, 2))).toBe(true);
  });

  it("ignores same direction, other agents and revoked ghosts", () => {
    expect(hasReverse([edge(1, 2)], edge(1, 2))).toBe(false);
    expect(hasReverse([edge(3, 1)], edge(1, 2))).toBe(false);
    expect(hasReverse([edge(2, 1, "revoked")], edge(1, 2))).toBe(false);
  });
});

describe("pair geometry", () => {
  const a = { x: 0, y: 0 };
  const b = { x: 100, y: 0 };

  it("leaves a lone edge where it was", () => {
    expect(lineShift(a, b, false)).toEqual({ x: 0, y: 0 });
    expect(labelTransform(a, b, false, 22)).toBe("translate(-50%, 0) translate(50px, 22px)");
  });

  it("moves the two directions of a pair to opposite sides", () => {
    const forward = lineShift(a, b, true);
    const back = lineShift(b, a, true);
    expect(Math.abs(forward.y)).toBeCloseTo(PAIR_SHIFT);
    expect(back.y).toBeCloseTo(-forward.y);
    expect(back.x + forward.x).toBeCloseTo(0);
  });

  it("keeps the unit normal for a zero-length line instead of dividing by zero", () => {
    const n = normal(a, a);
    expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
  });

  it("puts the two labels of a pair on opposite sides of the line, clear of it", () => {
    const y = (t: string) => Number(/translate\(-?[\d.]+px, (-?[\d.]+)px\)$/.exec(t)![1]);
    const forward = y(labelTransform(a, b, true, 22));
    const back = y(labelTransform(b, a, true, 22));
    expect(forward).toBeGreaterThan(PAIR_SHIFT + 28);
    expect(back).toBeCloseTo(-forward);
  });
});
