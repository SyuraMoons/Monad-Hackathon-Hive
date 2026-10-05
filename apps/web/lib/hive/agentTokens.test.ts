import { describe, expect, it } from "vitest";
import { clearAgentTokens, loadAgentTokens, saveAgentTokens } from "./agentTokens";

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = v),
    removeItem: (k: string) => void delete data[k],
  };
}

const OWNER = "0x00000000000000000000000000000000000000A1";
const token = (expiresAt: number) => ({ agentToken: "tok", mcpUrl: "http://localhost:4000/mcp", expiresAt });

describe("agent tokens", () => {
  it("round-trips the tokens that have not expired", () => {
    const store = memory();
    saveAgentTokens(OWNER, { "1": token(2000), "2": token(500) }, store);
    expect(Object.keys(loadAgentTokens(OWNER, 1000, store))).toEqual(["1"]);
  });

  it("keeps one set per owner, whatever the address casing", () => {
    const store = memory();
    saveAgentTokens(OWNER, { "1": token(2000) }, store);
    expect(loadAgentTokens(OWNER.toLowerCase(), 1000, store)).toHaveProperty("1");
    expect(loadAgentTokens("0x00000000000000000000000000000000000000b2", 1000, store)).toEqual({});
  });

  it("returns nothing for malformed or wrong-shape values", () => {
    for (const bad of ["{nope", JSON.stringify([1]), JSON.stringify({ x: token(2000) }), JSON.stringify({ "1": { agentToken: "" } })]) {
      expect(loadAgentTokens(OWNER, 1000, memory({ [`hive:agent-tokens:${OWNER.toLowerCase()}`]: bad }))).toEqual({});
    }
  });

  it("clears the saved tokens", () => {
    const store = memory();
    saveAgentTokens(OWNER, { "1": token(2000) }, store);
    clearAgentTokens(OWNER, store);
    expect(loadAgentTokens(OWNER, 1000, store)).toEqual({});
  });

  it("does nothing without storage", () => {
    saveAgentTokens(OWNER, { "1": token(2000) }, null);
    expect(loadAgentTokens(OWNER, 1000, null)).toEqual({});
  });
});
