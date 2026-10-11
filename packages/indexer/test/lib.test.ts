import { describe, expect, it } from "vitest";
import { edgeCovers, pickEdge, type EdgeLike } from "../src/lib.js";

const edge = (o: Partial<EdgeLike> & { id: string }): EdgeLike => ({ toAgent: "2", topic: "work", expiresAt: 2000, active: true, ...o });
const target = { toAgent: "2", topic: "work", at: 1000 };

describe("edgeCovers mirrors PropagationEngine", () => {
  it("matches the topic or the all-topics edge", () => {
    expect(edgeCovers(edge({ id: "1" }), target)).toBe(true);
    expect(edgeCovers(edge({ id: "1", topic: "*" }), target)).toBe(true);
    expect(edgeCovers(edge({ id: "1", topic: "other" }), target)).toBe(false);
  });
  it("needs an active edge to the same agent that has not expired", () => {
    expect(edgeCovers(edge({ id: "1", active: false }), target)).toBe(false);
    expect(edgeCovers(edge({ id: "1", toAgent: "3" }), target)).toBe(false);
    expect(edgeCovers(edge({ id: "1", expiresAt: 1000 }), target)).toBe(false); // equal means expired
    expect(edgeCovers(edge({ id: "1", expiresAt: 1001 }), target)).toBe(true);
  });
});

describe("pickEdge", () => {
  it("takes the lowest numeric id, not the lowest string", () => {
    expect(pickEdge([edge({ id: "10" }), edge({ id: "9" })], target, new Set())?.id).toBe("9");
  });
  it("skips edges already credited in the same tx", () => {
    const edges = [edge({ id: "1" }), edge({ id: "2", topic: "*" })];
    expect(pickEdge(edges, target, new Set(["1"]))?.id).toBe("2");
    expect(pickEdge(edges, target, new Set(["1", "2"]))).toBeUndefined();
  });
  it("returns nothing when no edge covers the target", () => {
    expect(pickEdge([edge({ id: "1", active: false })], target, new Set())).toBeUndefined();
  });
});
