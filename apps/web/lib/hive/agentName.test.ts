import { describe, expect, it } from "vitest";
import { checkAgentName } from "./agentName";

describe("checkAgentName", () => {
  it("trims and collapses spaces", () => {
    expect(checkAgentName("  Claude   bridge ", [])).toEqual({ name: "Claude bridge" });
  });

  it("refuses an empty name", () => {
    expect(checkAgentName("   ", [])).toHaveProperty("error");
  });

  it("refuses a name over 64 characters, and accepts exactly 64", () => {
    expect(checkAgentName("a".repeat(65), [])).toHaveProperty("error");
    expect(checkAgentName("a".repeat(64), [])).toEqual({ name: "a".repeat(64) });
  });

  it("refuses a name another agent has, ignoring case", () => {
    expect(checkAgentName("claude", ["Claude"])).toHaveProperty("error");
    expect(checkAgentName("Claude 2", ["Claude"])).toEqual({ name: "Claude 2" });
  });
});
