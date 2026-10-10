import { encrypt } from "@hive/crypto";
import { HiveError, type Hex } from "@hive/shared";
import { SignJWT } from "jose";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// The tests run against the real bridge app with in-memory chain and store (no network).
import { createApp } from "../../../apps/bridge/src/app.js";
import { topicHash } from "../../../apps/bridge/src/permissions.js";
import { SessionStore } from "../../../apps/bridge/src/sessions.js";
import { InMemoryChain, InMemoryCiphertextStore } from "../../../apps/bridge/src/stubs.js";
import { TokenService } from "../../../apps/bridge/src/tokens.js";
import type { ChainWriter } from "../../../apps/bridge/src/types.js";
import { HiveClient } from "../src/index.js";

const OWNER = "0x00000000000000000000000000000000000000a1";
const ZERO = "0x0000000000000000000000000000000000000000";
const KEY = ("0x" + "55".repeat(32)) as Hex;
const [CLAUDE, CHATGPT, THERAPY] = [1n, 2n, 3n];
const nowS = () => Math.floor(Date.now() / 1000);

const SECRET = "m".repeat(40);
const tokens = new TokenService(SECRET);
const sessions = new SessionStore();
const chain = new InMemoryChain();
const store = new InMemoryCiphertextStore();
const writer: ChainWriter = {
  async write({ agentId, contentHash, topic }) {
    const slotId = BigInt(100 + chain.slots.length);
    chain.slots.push({ id: slotId, agentId, contentHash, topic, writtenAt: BigInt(nowS()) });
    const propagatedTo = chain.edges.filter((e) => e.active && e.from === agentId && e.topicHash === topicHash(topic) && e.expiresAt > BigInt(nowS())).map((e) => e.to);
    return { txHash: ("0x" + "ee".repeat(32)) as Hex, slotId, propagatedTo };
  },
};

let server: Server;
let mcpUrl: string;
const token: Record<string, string> = {};
const clients: HiveClient[] = [];
const client = (agentToken: string) => {
  const c = new HiveClient({ mcpUrl, agentToken });
  clients.push(c);
  return c;
};

beforeAll(async () => {
  for (const [id, name] of [[CLAUDE, "Claude"], [CHATGPT, "ChatGPT"], [THERAPY, "Therapy Bot"]] as const) {
    chain.agents.set(id, { id, name, owner: OWNER, agentType: "other", writer: ZERO });
    sessions.put({ agentId: id, name, owner: OWNER, encryptionKey: KEY, agentPrivateKey: KEY, expiresAt: nowS() + 3600 });
    token[name] = (await tokens.signAgent(id, OWNER)).token;
  }
  chain.edges.push({ id: 1n, from: CLAUDE, to: CHATGPT, topicHash: topicHash("work"), expiresAt: BigInt(nowS() + 3600), active: true });
  const sealed = await encrypt("Nexus, deadline 13 Okt", KEY);
  await store.put(sealed.contentHash, { ...sealed, owner: OWNER, keyId: "hive/encrypt" });
  chain.slots.push({ id: 7n, agentId: CLAUDE, contentHash: sealed.contentHash, topic: "work", writtenAt: BigInt(nowS() - 5) });

  const app = createApp({ corsOrigins: [], tokens, verifySignature: async () => false, probes: { rpc: async () => true, supabase: async () => true }, sessions, chain, store, writer });
  server = app.listen(0);
  mcpUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
});
afterAll(async () => {
  await Promise.all(clients.map((c) => c.close()));
  await new Promise<void>((r) => server.close(() => r()));
});

describe("HiveClient", () => {
  it("whoami reflects the token's agent", async () => {
    expect(await client(token["ChatGPT"]!).whoami()).toMatchObject({ agentId: 2n, name: "ChatGPT" });
  });

  it("Claude writes, ChatGPT reads it; Therapy Bot (no edge) gets nothing", async () => {
    const w = await client(token["Claude"]!).writeMemory({ topic: "work", content: "Launch moved to Friday" });
    expect(w.propagatedTo).toEqual([2n]);

    const read = await client(token["ChatGPT"]!).readMemory({ topic: "work" });
    expect(read.memories.map((m) => m.content)).toContain("Launch moved to Friday");
    expect(read.memories[0]).toMatchObject({ fromName: "Claude", topic: "work" });

    expect((await client(token["Therapy Bot"]!).readMemory()).memories).toEqual([]);
  });

  it("a wrong token is rejected with the bridge's error code", async () => {
    const err = await client("not-a-token").whoami().catch((e) => e);
    expect(err).toBeInstanceOf(HiveError);
    expect(err.code).toBe("UNAUTHORIZED");
  });

  it("an expired token fails fast as SESSION_EXPIRED, before any request", async () => {
    const expired = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setExpirationTime(nowS() - 10).sign(new TextEncoder().encode(SECRET));
    const err = await client(expired).readMemory().catch((e) => e);
    expect(err).toBeInstanceOf(HiveError);
    expect(err.code).toBe("SESSION_EXPIRED");
  });

  it("lists the bridge's tools with an object input schema", async () => {
    const tools = await client(token["Claude"]!).listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["hive_list_memory", "hive_read_memory", "hive_save_session", "hive_whoami", "hive_write_memory"]);
    for (const t of tools) expect(t.inputSchema.type).toBe("object");
  });

  it("callTool returns the tool's text, and a tool failure as isError", async () => {
    const ok = await client(token["ChatGPT"]!).callTool("hive_whoami", {});
    expect(ok.isError).toBe(false);
    expect(JSON.parse(ok.text)).toMatchObject({ agentId: "2", name: "ChatGPT" });

    const bad = await client(token["Claude"]!).callTool("hive_write_memory", { topic: "work", content: "" });
    expect(bad.isError).toBe(true);
    expect(bad.text).not.toBe("");
  });

  it("callTool fails fast on an expired token", async () => {
    const expired = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setExpirationTime(nowS() - 10).sign(new TextEncoder().encode(SECRET));
    await expect(client(expired).callTool("hive_whoami", {})).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  });

  it("surfaces a tool error instead of returning empty", async () => {
    const err = await client(token["Claude"]!).writeMemory({ topic: "work", content: "" }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
  });
});
