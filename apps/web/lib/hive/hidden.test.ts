import { describe, expect, it } from "vitest";
import { loadHidden, saveHidden } from "./hidden";

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
}

const OWNER = "0x00000000000000000000000000000000000000A1";

describe("hidden agents", () => {
  it("round-trips a list, once per id", () => {
    const store = memory();
    saveHidden(OWNER, ["2", "5", "2"], store);
    expect(loadHidden(OWNER, store)).toEqual(["2", "5"]);
  });

  it("keeps one list per owner, whatever the address casing", () => {
    const store = memory();
    saveHidden(OWNER, ["2"], store);
    expect(loadHidden(OWNER.toLowerCase(), store)).toEqual(["2"]);
    expect(loadHidden("0x00000000000000000000000000000000000000b2", store)).toEqual([]);
  });

  it("returns an empty list for malformed or wrong-shape values", () => {
    for (const bad of ["{nope", JSON.stringify({ a: 1 }), JSON.stringify(["x"]), JSON.stringify([1])]) {
      expect(loadHidden(OWNER, memory({ [`hive:hidden:${OWNER.toLowerCase()}`]: bad }))).toEqual([]);
    }
  });

  it("does not throw when storage is missing or throws", () => {
    const boom = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("full"); } };
    expect(loadHidden(OWNER, null)).toEqual([]);
    expect(loadHidden(OWNER, boom)).toEqual([]);
    expect(() => saveHidden(OWNER, ["1"], boom)).not.toThrow();
    expect(() => saveHidden(OWNER, ["1"], null)).not.toThrow();
  });
});
