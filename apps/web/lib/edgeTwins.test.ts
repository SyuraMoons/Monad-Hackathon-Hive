import { describe, expect, it } from "vitest";
import { twinsOf } from "./edgeTwins";

const A = BigInt(1);
const B = BigInt(2);
const edge = (key: string, edgeId: number | null, o: Partial<{ from: bigint; to: bigint; topic: string; state: string }> = {}) => ({
  key,
  edgeId: edgeId === null ? null : BigInt(edgeId),
  from: A,
  to: B,
  topic: "work",
  state: "signed",
  ...o,
});

describe("twinsOf", () => {
  it("returns every signed edge with the same from, to and topic, oldest first", () => {
    const edges = [edge("9", 9), edge("3", 3), edge("5", 5)];
    expect(twinsOf(edges, { from: A, to: B, topic: "work" }).map((e) => e.key)).toEqual(["3", "5", "9"]);
  });

  it("leaves out other topics, the all-topics edge, the reverse direction and other agents", () => {
    const edges = [edge("1", 1, { topic: "personal" }), edge("2", 2, { topic: "*" }), edge("3", 3, { from: B, to: A }), edge("4", 4, { to: BigInt(7) })];
    expect(twinsOf(edges, { from: A, to: B, topic: "work" })).toEqual([]);
  });

  it("leaves out edges that are pending, revoking or revoked, or have no id yet", () => {
    const edges = [edge("p", null, { state: "pending" }), edge("r1", 1, { state: "revoking" }), edge("r2", 2, { state: "revoked" }), edge("n", null)];
    expect(twinsOf(edges, { from: A, to: B, topic: "work" })).toEqual([]);
  });
});
