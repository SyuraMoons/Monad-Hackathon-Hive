import { encrypt } from "@hive/crypto";
import type { Hex } from "@hive/shared";
import type { ChainWriter } from "../src/types.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decrypt } from "@hive/crypto";
import { createApp } from "../src/app.js";
import { SessionStore } from "../src/sessions.js";
import { InMemoryChain, InMemoryCiphertextStore } from "../src/stubs.js";
import { topicHash } from "../src/permissions.js";
import { TokenService } from "../src/tokens.js";

const OWNER = "0x00000000000000000000000000000000000000a1";
const ZERO = "0x0000000000000000000000000000000000000000";
const KEY = ("0x" + "55".repeat(32)) as Hex;
const [CLAUDE, CHATGPT, THERAPY] = [1n, 2n, 3n];

const nowS = () => Math.floor(Date.now() / 1000);
const tokens = new TokenService("m".repeat(40));
const sessions = new SessionStore();
const chain = new InMemoryChain();
const store = new InMemoryCiphertextStore();
let server: Server;
let url: string;
const agentToken: Record<string, string> = {};

async function connect(token: string | undefined) {
  const client = new Client({ name: "test", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: token ? { Authorization: `Bearer ${token}` } : {} } });
  await client.connect(transport);
  return client;
}
const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
  const res = await client.callTool({ name, arguments: args });
  return { isError: res.isError, data: res.structuredContent as any, text: (res.content as { text: string }[])[0]?.text };
};

// Stands in for MemorySlots + PropagationEngine: records the slot and "propagates" along active, unexpired edges.
let nextSlot = 100n;
const writer: ChainWriter = {
  async write({ agentId, contentHash, topic }) {
    const slotId = nextSlot++;
    chain.slots.push({ id: slotId, agentId, contentHash, topic, writtenAt: BigInt(nowS()) });
    const propagatedTo = chain.edges.filter((e) => e.active && e.from === agentId && e.topicHash === topicHash(topic) && e.expiresAt > BigInt(nowS())).map((e) => e.to);
    return { txHash: ("0x" + "ee".repeat(32)) as Hex, slotId, propagatedTo };
  },
};

beforeAll(async () => {
  for (const [id, name] of [[CLAUDE, "Claude"], [CHATGPT, "ChatGPT"], [THERAPY, "Therapy Bot"]] as const) {
    chain.agents.set(id, { id, name, owner: OWNER, agentType: "other", writer: ZERO });
    sessions.put({ agentId: id, name, owner: OWNER, encryptionKey: KEY, agentPrivateKey: KEY, expiresAt: nowS() + 3600 });
    agentToken[name] = (await tokens.signAgent(id, OWNER)).token;
  }
  chain.edges.push({ id: 1n, from: CLAUDE, to: CHATGPT, topicHash: topicHash("work"), expiresAt: BigInt(nowS() + 3600), active: true });
  const sealed = await encrypt("Nexus, deadline 13 Okt", KEY);
  await store.put(sealed.contentHash, { ...sealed, owner: OWNER, keyId: "hive/encrypt" });
  chain.slots.push({ id: 7n, agentId: CLAUDE, contentHash: sealed.contentHash, topic: "work", writtenAt: BigInt(nowS() - 5) });

  const app = createApp({ corsOrigins: [], tokens, verifySignature: async () => false, probes: { rpc: async () => true, supabase: async () => true }, sessions, chain, store, writer });
  server = app.listen(0);
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("MCP over Streamable HTTP (official SDK client)", () => {
  it("lists the three Hive tools", async () => {
    const client = await connect(agentToken["ChatGPT"]);
    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(tools).toEqual(["hive_read_memory", "hive_whoami", "hive_write_memory"]);
    await client.close();
  });

  it("ChatGPT reads Claude's work memory; ids go out as decimal strings", async () => {
    const client = await connect(agentToken["ChatGPT"]);
    const { data } = await call(client, "hive_read_memory", {});
    expect(data.memories).toHaveLength(1);
    expect(data.memories[0]).toMatchObject({ slotId: "7", fromAgentId: "1", fromName: "Claude", topic: "work", content: "Nexus, deadline 13 Okt" });
    expect((await call(client, "hive_read_memory", { topic: "health" })).data.memories).toEqual([]);
    await client.close();
  });

  it("Therapy Bot has no edge: empty, five times in a row", async () => {
    const client = await connect(agentToken["Therapy Bot"]);
    for (let i = 0; i < 5; i++) expect((await call(client, "hive_read_memory", {})).data.memories).toEqual([]);
    await client.close();
  });

  it("whoami takes identity from the token", async () => {
    const client = await connect(agentToken["ChatGPT"]);
    expect((await call(client, "hive_whoami")).data).toMatchObject({ agentId: "2", name: "ChatGPT", owner: "0x00000000000000000000000000000000000000A1" });
    await client.close();
  });

  it("Claude writes through MCP; ChatGPT reads it; Therapy Bot (no edge) still gets nothing", async () => {
    const claude = await connect(agentToken["Claude"]);
    const w = await call(claude, "hive_write_memory", { topic: "work", content: "Launch moved to Friday" });
    expect(w.isError).toBeFalsy();
    expect(w.data).toMatchObject({ propagatedTo: ["2"], txHash: "0x" + "ee".repeat(32) });
    expect(w.data.contentHash).toMatch(/^0x[0-9a-f]{64}$/);
    await claude.close();

    // The store holds ciphertext only, and it decrypts with the agent's key.
    const sealed = await store.get(w.data.contentHash);
    expect(Buffer.from(sealed!.ciphertext).toString("utf8")).not.toContain("Friday");
    expect(await decrypt(sealed!, KEY)).toBe("Launch moved to Friday");

    const chatgpt = await connect(agentToken["ChatGPT"]);
    const read = (await call(chatgpt, "hive_read_memory", { topic: "work" })).data.memories.map((m: any) => m.content);
    expect(read).toContain("Launch moved to Friday");
    await chatgpt.close();

    const therapy = await connect(agentToken["Therapy Bot"]);
    expect((await call(therapy, "hive_read_memory", {})).data.memories).toEqual([]);
    await therapy.close();
  });

  it("a write on a topic without an edge stays with the writer", async () => {
    const claude = await connect(agentToken["Claude"]);
    const w = await call(claude, "hive_write_memory", { topic: "health", content: "private note" });
    expect(w.data.propagatedTo).toEqual([]);
    await claude.close();
    const chatgpt = await connect(agentToken["ChatGPT"]);
    expect((await call(chatgpt, "hive_read_memory", { topic: "health" })).data.memories).toEqual([]);
    await chatgpt.close();
  });

  it("rejects bad input before touching the chain", async () => {
    const claude = await connect(agentToken["Claude"]);
    const before = chain.slots.length;
    const res = await claude.callTool({ name: "hive_write_memory", arguments: { topic: "Bad Topic!", content: "x" } });
    expect(res.isError).toBe(true);
    expect(chain.slots.length).toBe(before);
    await claude.close();
  });

  it("answers GET and DELETE with 405, since the transport is stateless", async () => {
    for (const method of ["GET", "DELETE"]) {
      const res = await fetch(url, { method });
      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toBe("POST");
    }
  });

  it("rejects missing, user-typed and revoked tokens with 401", async () => {
    const post = (token?: string) => fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(token && { authorization: `Bearer ${token}` }) }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
    expect((await post()).status).toBe(401);
    expect((await post((await tokens.signUser(OWNER)).token)).status).toBe(401);
    sessions.delete(THERAPY);
    expect((await post(agentToken["Therapy Bot"])).status).toBe(401);
  });
});
