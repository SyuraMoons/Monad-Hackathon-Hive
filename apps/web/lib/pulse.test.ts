import { describe, expect, it } from "vitest";
import { findPulseEdge } from "./pulse";

const edge = (from: number, to: number, topic: string, state = "signed") => ({ from: BigInt(from), to: BigInt(to), topic, state });
const pulse = { from: "1", to: "2", topic: "general" };

describe("findPulseEdge", () => {
  it("uses an all-topics edge for any topic", () => {
    const all = edge(1, 2, "*");
    expect(findPulseEdge([all], pulse)).toBe(all);
  });

  it("prefers the edge for exactly this topic", () => {
    const exact = edge(1, 2, "general");
    expect(findPulseEdge([edge(1, 2, "*"), exact], pulse)).toBe(exact);
  });

  it("ignores other topics, other agents, the reverse direction and revoked or pending edges", () => {
    expect(findPulseEdge([edge(1, 2, "work"), edge(3, 2, "*"), edge(2, 1, "*"), edge(1, 2, "*", "revoked"), edge(1, 2, "*", "pending")], pulse)).toBeUndefined();
  });
});
