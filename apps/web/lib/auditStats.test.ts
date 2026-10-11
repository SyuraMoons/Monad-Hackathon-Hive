import { describe, expect, it } from "vitest";
import { summarize } from "./auditStats";

const stats = { agents: 3, edgesAdded: 5, edgesRevoked: 2, memories: 9, propagations: 7, violations: 0 };

describe("summarize", () => {
  it("counts active edges as added minus revoked and notes the revoked ones", () => {
    const { tiles } = summarize(stats);
    expect(tiles.find((t) => t.label === "Edges")).toEqual({ label: "Edges", value: "3", note: "2 revoked" });
    expect(tiles.find((t) => t.label === "Deliveries")?.value).toBe("7");
  });
  it("has no revoked note when nothing was revoked, and never goes below zero", () => {
    expect(summarize({ ...stats, edgesRevoked: 0 }).tiles[1].note).toBeUndefined();
    expect(summarize({ ...stats, edgesAdded: 1, edgesRevoked: 2 }).tiles[1].value).toBe("0");
  });
  it("passes the policy check only at zero violations, and counts them otherwise", () => {
    expect(summarize(stats).policy).toEqual({ ok: true, text: "0 deliveries without an active edge" });
    expect(summarize({ ...stats, violations: 1 }).policy).toEqual({ ok: false, text: "1 delivery without an active edge" });
    expect(summarize({ ...stats, violations: 3 }).policy.text).toBe("3 deliveries without an active edge");
  });
});
