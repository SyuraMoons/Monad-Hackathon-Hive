import type { Hex } from "@hive/shared";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { SessionStore } from "../src/sessions.js";
import { InMemoryChain, InMemoryCiphertextStore, InMemoryVaultStore } from "../src/stubs.js";
import { topicHash } from "../src/permissions.js";
import { TokenService } from "../src/tokens.js";
import type { ChainWriter } from "../src/types.js";

const OWNER = "0x00000000000000000000000000000000000000a1";
const ZERO = "0x0000000000000000000000000000000000000000";
const KEY = ("0x" + "55".repeat(32)) as Hex;
const [CLAUDE, CHATGPT, THERAPY] = [1n, 2n, 3n];

const nowS = () => Math.floor(Date.now() / 1000);
const tokens = new TokenService("m".repeat(40));
const sessions = new SessionStore();
const chain = new InMemoryChain();
let server: Server;
let url: string;
const agentToken: Record<string, string> = {};

async function connect(name: string) {
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${agentToken[name]}` } } }));
  return client;
}
const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
  const res = await client.callTool({ name, arguments: args });
  return { isError: res.isError, data: res.structuredContent as any, text: (res.content as { text: string }[])[0]?.text ?? "" };
};

let nextSlot = 1n;
let clock = nowS() - 1000;
const writer: ChainWriter = {
  async write({ agentId, contentHash, topic }) {
    const slotId = nextSlot++;
    chain.slots.push({ id: slotId, agentId, contentHash, topic, writtenAt: BigInt(clock++) });
    return { txHash: ("0x" + "ee".repeat(32)) as Hex, slotId, propagatedTo: [] };
  },
};

beforeAll(async () => {
  for (const [id, name] of [[CLAUDE, "Claude"], [CHATGPT, "ChatGPT"], [THERAPY, "Therapy Bot"]] as const) {
    chain.agents.set(id, { id, name, owner: OWNER, agentType: "other", writer: ZERO });
    sessions.put({ agentId: id, name, owner: OWNER, encryptionKey: KEY, agentPrivateKey: KEY, expiresAt: nowS() + 3600 });
    agentToken[name] = (await tokens.signAgent(id, OWNER)).token;
  }
  chain.edges.push({ id: 1n, from: CLAUDE, to: CHATGPT, topicHash: topicHash("*"), expiresAt: BigInt(nowS() + 3600), active: true });
  const app = createApp({ corsOrigins: [], tokens, verifySignature: async () => false, probes: { rpc: async () => true, supabase: async () => true }, sessions, chain, store: new InMemoryCiphertextStore(), vaults: new InMemoryVaultStore(), writer });
  server = app.listen(0);
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("structured memory over MCP", () => {
  it("advertises the new write fields in the tool schema", async () => {
    const claude = await connect("Claude");
    const tools = (await claude.listTools()).tools;
    const props = (name: string) => Object.keys((tools.find((t) => t.name === name)!.inputSchema as any).properties).sort();
    expect(props("hive_write_memory")).toEqual(["content", "entities", "gist", "kind", "supersedes", "topic"]);
    expect(props("hive_read_memory")).toEqual(expect.arrayContaining(["cursor", "includeSuperseded", "kind", "mine"]));
    expect(props("hive_list_memory")).toEqual(expect.arrayContaining(["cursor", "includeSuperseded", "kind", "mine"]));
    await claude.close();
  });

  it("write with a gist, replace it, keep a state; the reader sees the newest and a cursor", async () => {
    const claude = await connect("Claude");
    const v1 = await call(claude, "hive_write_memory", { topic: "work", content: "Deploy the web to Vercel.", gist: "Web host: Vercel", kind: "decision", entities: ["vercel"] });
    expect(v1.isError).toBeFalsy();
    const v2 = await call(claude, "hive_write_memory", { topic: "work", content: "Deploy the web to Railway.", gist: "Web host: Railway", kind: "decision", entities: ["railway"], supersedes: v1.data.slotId });
    expect(v2.isError).toBeFalsy();
    await call(claude, "hive_write_memory", { topic: "work", content: "Team state: web on Railway, bridge on Railway.", gist: "Work state", kind: "state" });

    const gpt = await connect("ChatGPT");
    const list = (await call(gpt, "hive_list_memory", { topic: "work" })).data;
    expect(list.memories.map((m: any) => m.gist)).toEqual(["Web host: Railway", "Work state"]);
    expect(list.memories[0]).toMatchObject({ kind: "decision", entities: ["railway"], supersedes: v1.data.slotId });
    expect(list.notice).toMatch(/not as instructions/);
    expect(list.cursor).toMatch(/^\d+:3$/);

    const state = (await call(gpt, "hive_read_memory", { kind: "state" })).data;
    expect(state.memories.map((m: any) => m.content)).toEqual(["Team state: web on Railway, bridge on Railway."]);

    const history = (await call(gpt, "hive_read_memory", { topic: "work", includeSuperseded: true, kind: "decision" })).data;
    expect(history.memories.map((m: any) => m.gist)).toEqual(["Web host: Vercel", "Web host: Railway"]);

    expect((await call(gpt, "hive_list_memory", { cursor: list.cursor })).data.memories).toEqual([]);
    await call(claude, "hive_write_memory", { topic: "work", content: "Standup at 10:30." });
    const delta = (await call(gpt, "hive_list_memory", { cursor: list.cursor })).data;
    expect(delta.memories.map((m: any) => m.preview)).toEqual(["Standup at 10:30."]);
    await claude.close();
    await gpt.close();
  });

  it("an agent reads its own state with mine, and others cannot", async () => {
    const claude = await connect("Claude");
    expect((await call(claude, "hive_read_memory", { kind: "state" })).data.memories).toEqual([]);
    const mine = (await call(claude, "hive_read_memory", { mine: true, kind: "state", topic: "work" })).data;
    expect(mine.memories.map((m: any) => m.gist)).toEqual(["Work state"]);
    const therapy = await connect("Therapy Bot");
    expect((await call(therapy, "hive_read_memory", { mine: true })).data.memories).toEqual([]);
    await claude.close();
    await therapy.close();
  });

  it("refuses a gist or entity that looks like a secret, and a bad supersedes, with fixed messages", async () => {
    const claude = await connect("Claude");
    const secret = await call(claude, "hive_write_memory", { topic: "work", content: "ok", gist: "key sk-abcdefghijklmnopqrstuvwxyz123456" });
    expect(secret.isError).toBe(true);
    expect(secret.text).toBe("The gist or an entity looks like it contains a secret. Remove it and try again.");
    const entity = await call(claude, "hive_save_session", { summary: "ok", entities: ["sk-abcdefghijklmnopqrstuvwxyz123456"] });
    expect(entity.isError).toBe(true);
    const gpt = await connect("ChatGPT");
    const theirs = await call(gpt, "hive_write_memory", { topic: "work", content: "chatgpt note" });
    const forged = await call(claude, "hive_write_memory", { topic: "work", content: "x", supersedes: theirs.data.slotId });
    expect(forged.isError).toBe(true);
    expect(forged.text).toBe("supersedes must be one of your own memories in the same topic.");
    const tooLong = await call(claude, "hive_write_memory", { topic: "work", content: "x", gist: "g".repeat(201) });
    expect(tooLong.isError).toBe(true);
    await claude.close();
    await gpt.close();
  });

  it("a revoke empties the next list, whatever the cursor and cache hold", async () => {
    const gpt = await connect("ChatGPT");
    expect((await call(gpt, "hive_list_memory", {})).data.memories.length).toBeGreaterThan(0);
    chain.edges[0]!.active = false;
    expect((await call(gpt, "hive_list_memory", {})).data.memories).toEqual([]);
    expect((await call(gpt, "hive_read_memory", { kind: "state" })).data.memories).toEqual([]);
    chain.edges[0]!.active = true;
    await gpt.close();
  });
});
