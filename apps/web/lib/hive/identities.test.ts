import { describe, expect, it } from "vitest";
import { loadIdentities, saveIdentities } from "./identities";

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
}

const REGISTRY = "0x06F4401cF289bfc29de59Fc1B624096Dc69ff25B";
const OWNER = "0x00000000000000000000000000000000000000A1";
const TX = `0x${"ab".repeat(32)}`;

describe("ERC-8004 identities kept in this browser", () => {
  it("round-trips a record", () => {
    const store = memory();
    saveIdentities(REGISTRY, OWNER, { "7": { erc8004Id: "2142", txHash: TX } }, store);
    expect(loadIdentities(REGISTRY, OWNER, store)).toEqual({ "7": { erc8004Id: "2142", txHash: TX } });
  });

  it("keeps one record per owner and per registry deploy, whatever the address casing", () => {
    const store = memory();
    saveIdentities(REGISTRY, OWNER, { "7": { erc8004Id: "2142", txHash: TX } }, store);
    expect(Object.keys(loadIdentities(REGISTRY.toLowerCase(), OWNER.toLowerCase(), store))).toEqual(["7"]);
    expect(loadIdentities(REGISTRY, "0x00000000000000000000000000000000000000b2", store)).toEqual({});
    expect(loadIdentities("0x00000000000000000000000000000000000000c3", OWNER, store)).toEqual({});
  });

  it("returns nothing for malformed or wrong-shape values", () => {
    const key = `hive:erc8004:${REGISTRY.toLowerCase()}:${OWNER.toLowerCase()}`;
    for (const bad of ["{nope", JSON.stringify([1]), JSON.stringify({ "7": { erc8004Id: "x", txHash: TX } }), JSON.stringify({ "7": { erc8004Id: "1", txHash: "0x12" } })]) {
      expect(loadIdentities(REGISTRY, OWNER, memory({ [key]: bad }))).toEqual({});
    }
  });

  it("survives a store that throws", () => {
    const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("full"); } };
    expect(loadIdentities(REGISTRY, OWNER, broken)).toEqual({});
    expect(() => saveIdentities(REGISTRY, OWNER, {}, broken)).not.toThrow();
  });
});
