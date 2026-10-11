import { ERC8004_REGISTRATION_TYPE, agentCardPath, hiveDeployment, zAgentCard, zErrorEnvelope, type Hex } from "@hive/shared";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp, type AppDeps } from "../src/app.js";
import { SessionStore } from "../src/sessions.js";
import { InMemoryChain, InMemoryCiphertextStore, InMemoryVaultStore } from "../src/stubs.js";
import { TokenService } from "../src/tokens.js";
import type { ChainReader } from "../src/types.js";

const OWNER = "0x7F3A00000000000000000000000000000000C21e" as Hex;
const WRITER = "0x1111111111111111111111111111111111111111" as Hex;
const ZERO = "0x0000000000000000000000000000000000000000" as Hex;

let chain: InMemoryChain;
let sessions: SessionStore;

const build = (over: Partial<AppDeps> = {}) =>
  createApp({
    corsOrigins: [],
    tokens: new TokenService("s".repeat(40)),
    verifySignature: async () => false,
    probes: { rpc: async () => true, supabase: async () => true },
    sessions,
    chain,
    store: new InMemoryCiphertextStore(),
    vaults: new InMemoryVaultStore(),
    writer: { write: async () => { throw new Error("not used here"); } },
    publicUrl: "https://bridge.example.com/",
    ...over,
  });

beforeEach(() => {
  chain = new InMemoryChain();
  sessions = new SessionStore();
  chain.agents.set(7n, { id: 7n, name: "Claude", owner: OWNER, agentType: "claude", writer: WRITER });
  chain.agents.set(8n, { id: 8n, name: "Half done", owner: OWNER, agentType: "something-new", writer: ZERO });
});

describe("GET /agents/:id/card.json", () => {
  it("serves the card without a token, from registry data only", async () => {
    const res = await request(build()).get(agentCardPath(7n));
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.body).toEqual({
      type: ERC8004_REGISTRATION_TYPE,
      name: "Claude",
      description: expect.any(String),
      services: [{ name: "MCP", endpoint: "https://bridge.example.com/mcp", version: expect.any(String) }],
      x402Support: false,
      active: true,
      registrations: [],
      supportedTrust: [],
      hive: { chainId: hiveDeployment.chainId, agentRegistry: hiveDeployment.agentRegistry, agentId: "7", agentType: "claude", owner: OWNER },
    });
    expect(zAgentCard.parse(res.body).hive.agentId).toBe(7n);
  });

  it("marks an agent without a writer key inactive and maps an unknown type to other", async () => {
    const card = zAgentCard.parse((await request(build()).get(agentCardPath(8n))).body);
    expect(card.active).toBe(false);
    expect(card.hive.agentType).toBe("other");
  });

  it("derives the MCP endpoint from the request when no public URL is set", async () => {
    const card = zAgentCard.parse((await request(build({ publicUrl: undefined })).get(agentCardPath(7n)).set("Host", "bridge.test")).body);
    expect(card.services[0]?.endpoint).toBe("http://bridge.test/mcp");
  });

  it("is the same with or without a live session and holds no key or token", async () => {
    const before = (await request(build()).get(agentCardPath(7n))).text;
    const agentPrivateKey = ("0x" + "ab".repeat(32)) as Hex;
    const encryptionKey = ("0x" + "cd".repeat(32)) as Hex;
    sessions.put({ agentId: 7n, name: "Claude", owner: OWNER, encryptionKey, agentPrivateKey, expiresAt: Math.floor(Date.now() / 1000) + 3600 });
    const after = (await request(build()).get(agentCardPath(7n))).text;
    expect(after).toBe(before);
    expect(after).not.toContain(agentPrivateKey.slice(2));
    expect(after).not.toContain(encryptionKey.slice(2));
  });

  it("answers 404 for an unknown agent and 400 for a bad id", async () => {
    const missing = await request(build()).get(agentCardPath(99n));
    expect(missing.status).toBe(404);
    expect(zErrorEnvelope.parse(missing.body).error.code).toBe("NOT_FOUND");
    const bad = await request(build()).get("/agents/abc/card.json");
    expect(bad.status).toBe(400);
    expect(zErrorEnvelope.parse(bad.body).error.code).toBe("INVALID_INPUT");
  });

  it("answers 502 with a fixed message when the chain cannot be read", async () => {
    const down: ChainReader = Object.assign(Object.create(chain) as InMemoryChain, { agent: async () => { throw new Error("rpc secret-url down"); } });
    const res = await request(build({ chain: down })).get(agentCardPath(7n));
    expect(res.status).toBe(502);
    expect(res.text).not.toContain("secret-url");
  });
});
