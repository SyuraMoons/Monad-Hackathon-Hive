import { encrypt } from "@hive/crypto";
import type { Hex } from "@hive/shared";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { EventBus } from "../src/events.js";
import { topicHash } from "../src/permissions.js";
import { SessionStore } from "../src/sessions.js";
import { InMemoryChain, InMemoryCiphertextStore } from "../src/stubs.js";
import { TokenService } from "../src/tokens.js";
import type { ChainWriter } from "../src/types.js";

const OWNER = "0x00000000000000000000000000000000000000a1";
const OTHER = "0x00000000000000000000000000000000000000b2";
const ZERO = "0x0000000000000000000000000000000000000000";
const KEY = ("0x" + "55".repeat(32)) as Hex;
const [CLAUDE, GPT] = [1n, 2n];
const SECRET = "SECRET-MEMORY-TEXT";

const nowS = () => Math.floor(Date.now() / 1000);
const tokens = new TokenService("e".repeat(40));
const sessions = new SessionStore();
const chain = new InMemoryChain();
const store = new InMemoryCiphertextStore();
const events = new EventBus();
let server: Server;
let base: string;
const agentToken: Record<string, string> = {};

const writer: ChainWriter = {
  async write({ agentId, contentHash, topic }) {
    chain.slots.push({ id: 7n, agentId, contentHash, topic, writtenAt: BigInt(nowS()) });
    return { txHash: ("0x" + "ee".repeat(32)) as Hex, slotId: 7n, propagatedTo: [GPT] };
  },
};

async function mcp(token: string) {
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  return client;
}

/** Reads `data:` events from the SSE stream until `count` have arrived. */
async function collect(token: string, count: number, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}/v1/events?token=${token}`, { headers });
  if (!res.ok || !res.body) return { status: res.status, events: [] as any[], raw: "" };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let raw = "";
  const found: any[] = [];
  const deadline = Date.now() + 3000;
  while (found.length < count && Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    raw += decoder.decode(value);
    found.length = 0;
    for (const line of raw.split("\n")) if (line.startsWith("data: ")) found.push(JSON.parse(line.slice(6)));
  }
  await reader.cancel();
  return { status: res.status, events: found, raw };
}

beforeAll(async () => {
  for (const [id, name] of [[CLAUDE, "Claude"], [GPT, "GPT"]] as const) {
    chain.agents.set(id, { id, name, owner: OWNER, agentType: "other", writer: ZERO });
    sessions.put({ agentId: id, name, owner: OWNER, encryptionKey: KEY, agentPrivateKey: KEY, expiresAt: nowS() + 3600 });
    agentToken[name] = (await tokens.signAgent(id, OWNER)).token;
  }
  chain.edges.push({ id: 1n, from: CLAUDE, to: GPT, topicHash: topicHash("work"), expiresAt: BigInt(nowS() + 3600), active: true });
  const sealed = await encrypt(SECRET, KEY);
  await store.put(sealed.contentHash, { ...sealed, owner: OWNER, keyId: "hive/encrypt" });
  chain.slots.push({ id: 1n, agentId: CLAUDE, contentHash: sealed.contentHash, topic: "work", writtenAt: BigInt(nowS()) });

  const app = createApp({
    corsOrigins: [],
    tokens,
    verifySignature: async () => true,
    probes: { rpc: async () => true, supabase: async () => true },
    sessions,
    chain,
    store,
    writer,
    events,
  });
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }));

describe("GET /v1/events", () => {
  it("refuses a missing, agent or garbage token", async () => {
    expect((await fetch(`${base}/v1/events`)).status).toBe(401);
    expect((await fetch(`${base}/v1/events?token=${agentToken.Claude}`)).status).toBe(401);
    expect((await fetch(`${base}/v1/events?token=nope`)).status).toBe(401);
  });

  it("emits agent.connected once, on the first MCP call", async () => {
    const user = (await tokens.signUser(OWNER)).token;
    const stream = collect(user, 1);
    await new Promise((r) => setTimeout(r, 100));
    const client = await mcp(agentToken.Claude);
    await client.callTool({ name: "hive_whoami", arguments: {} });
    await client.callTool({ name: "hive_whoami", arguments: {} });
    const { status, events: got } = await stream;
    expect(status).toBe(200);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ type: "agent.connected", data: { agentId: "1" } });
    await client.close();
  });

  it("emits memory.written and memory.read, without any content", async () => {
    const user = (await tokens.signUser(OWNER)).token;
    const stream = collect(user, 3); // GPT's first call adds an agent.connected
    await new Promise((r) => setTimeout(r, 100));
    const claude = await mcp(agentToken.Claude);
    await claude.callTool({ name: "hive_write_memory", arguments: { topic: "work", content: SECRET } });
    const gpt = await mcp(agentToken.GPT);
    await gpt.callTool({ name: "hive_read_memory", arguments: {} });
    const { events: got, raw } = await stream;
    const types = got.map((e) => e.type);
    expect(types).toContain("memory.written");
    expect(types).toContain("memory.read");
    expect(got.find((e) => e.type === "memory.written").data).toMatchObject({ slotId: "7", agentId: "1", topic: "work", propagatedTo: ["2"] });
    expect(got.find((e) => e.type === "memory.read").data).toMatchObject({ readerAgentId: "2", fromAgentIds: ["1"], count: 2 }); // the seeded slot and the one just written
    expect(raw).not.toContain(SECRET);
    await claude.close();
    await gpt.close();
  });

  it("emits memory.written for hive_save_session, without the summary", async () => {
    const user = (await tokens.signUser(OWNER)).token;
    const stream = collect(user, 1); // Claude already made its first call in an earlier test
    await new Promise((r) => setTimeout(r, 100));
    const claude = await mcp(agentToken.Claude);
    await claude.callTool({ name: "hive_save_session", arguments: { summary: SECRET } });
    const { events: got, raw } = await stream;
    expect(got[0]).toMatchObject({ type: "memory.written", data: { agentId: "1", topic: "general" } });
    expect(raw).not.toContain(SECRET);
    await claude.close();
  });

  it("does not deliver another owner's events", async () => {
    const stranger = (await tokens.signUser(OTHER)).token;
    const res = await fetch(`${base}/v1/events?token=${stranger}`);
    const reader = res.body!.getReader();
    const client = await mcp(agentToken.Claude);
    await client.callTool({ name: "hive_whoami", arguments: {} });
    const race = await Promise.race([reader.read().then((r) => new TextDecoder().decode(r.value)), new Promise<string>((r) => setTimeout(() => r("timeout"), 400))]);
    expect(race).not.toContain("data:");
    await reader.cancel();
    await client.close();
  });

  it("replays what a client missed after Last-Event-ID", async () => {
    const bus = new EventBus(() => 1_700_000_000);
    bus.publish(OWNER, { type: "agent.connected", data: { agentId: "1" } });
    bus.publish(OWNER, { type: "agent.connected", data: { agentId: "2" } });
    const seen: string[] = [];
    bus.subscribe(OWNER, (e) => seen.push(e.id), "1");
    expect(seen).toEqual(["2"]);
  });
});

describe("re-authorizing", () => {
  it("keeps lastCallAt for the same owner and resets it for a different one", () => {
    const s = new SessionStore();
    const base = { agentId: 9n, name: "x", encryptionKey: KEY, agentPrivateKey: KEY, expiresAt: nowS() + 100 };
    s.put({ ...base, owner: OWNER });
    s.touch(9n);
    const first = s.get(9n)!.lastCallAt;
    expect(first).not.toBeNull();
    s.put({ ...base, owner: OWNER });
    expect(s.get(9n)!.lastCallAt).toBe(first);
    s.put({ ...base, owner: OTHER });
    expect(s.get(9n)!.lastCallAt).toBeNull();
  });
});
