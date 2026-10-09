import { describe, expect, it } from "vitest";
import { cleanLabel, loadAgentLabels, saveAgentLabels } from "./agentLabels";

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
}

const OWNER = "0x00000000000000000000000000000000000000A1";

describe("agent labels", () => {
  it("round-trips the labels", () => {
    const store = memory();
    saveAgentLabels(OWNER, { "2": "backend", "5": "research bot" }, store);
    expect(loadAgentLabels(OWNER, store)).toEqual({ "2": "backend", "5": "research bot" });
  });

  it("keeps one set per owner, whatever the address casing", () => {
    const store = memory();
    saveAgentLabels(OWNER, { "2": "backend" }, store);
    expect(loadAgentLabels(OWNER.toLowerCase(), store)).toEqual({ "2": "backend" });
    expect(loadAgentLabels("0x00000000000000000000000000000000000000b2", store)).toEqual({});
  });

  it("returns nothing for malformed or wrong-shape values", () => {
    const key = `hive:agent-labels:${OWNER.toLowerCase()}`;
    for (const bad of ["{nope", JSON.stringify(["x"]), JSON.stringify({ x: "a" }), JSON.stringify({ "1": "" }), JSON.stringify({ "1": 3 }), JSON.stringify({ "1": "a".repeat(65) })]) {
      expect(loadAgentLabels(OWNER, memory({ [key]: bad }))).toEqual({});
    }
  });

  it("does not throw when storage is missing or throws", () => {
    const boom = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("full"); } };
    expect(loadAgentLabels(OWNER, null)).toEqual({});
    expect(loadAgentLabels(OWNER, boom)).toEqual({});
    expect(() => saveAgentLabels(OWNER, { "1": "a" }, boom)).not.toThrow();
    expect(() => saveAgentLabels(OWNER, { "1": "a" }, null)).not.toThrow();
  });

  it("cleans a label: trims, collapses spaces, cuts at 64 characters", () => {
    expect(cleanLabel("  my   backend \n bot ")).toBe("my backend bot");
    expect(cleanLabel("   ")).toBe("");
    expect(cleanLabel("a".repeat(100))).toHaveLength(64);
  });
});
