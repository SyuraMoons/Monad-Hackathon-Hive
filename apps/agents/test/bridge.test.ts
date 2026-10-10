import { HiveClient } from "@hive/mcp-client";
import { ALL_TOPICS, type Hex } from "@hive/shared";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, it } from "vitest";
// The real bridge app with an in-memory chain and store (no network), as in @hive/mcp-client's tests.
import { createApp } from "../../bridge/src/app.js";
import { topicHash } from "../../bridge/src/permissions.js";
import { SessionStore } from "../../bridge/src/sessions.js";
import { InMemoryChain, InMemoryCiphertextStore } from "../../bridge/src/stubs.js";
import { TokenService } from "../../bridge/src/tokens.js";
import type { ChainWriter } from "../../bridge/src/types.js";
import { runTurn, toFunctionTools, type AssistantMessage, type ChatMessage, type Complete } from "../src/runner.js";

const OWNER = "0x00000000000000000000000000000000000000a1";
const ZERO = "0x0000000000000000000000000000000000000000";
const KEY = ("0x" + "55".repeat(32)) as Hex;
const [CLAUDE, DEEPSEEK] = [1n, 2n];
const nowS = () => Math.floor(Date.now() / 1000);

const tokens = new TokenService("d".repeat(40));
const sessions = new SessionStore();
const chain = new InMemoryChain();
const writer: ChainWriter = {
  async write({ agentId, contentHash, topic }) {
    const slotId = BigInt(100 + chain.slots.length);
    chain.slots.push({ id: slotId, agentId, contentHash, topic, writtenAt: BigInt(nowS()) });
    return { txHash: ("0x" + "ee".repeat(32)) as Hex, slotId, propagatedTo: [] };
  },
};

let server: Server;
const hive: Record<string, HiveClient> = {};

beforeAll(async () => {
  for (const [id, name, agentType] of [[CLAUDE, "Claude", "claude"], [DEEPSEEK, "DeepSeek", "deepseek"]] as const) {
    chain.agents.set(id, { id, name, owner: OWNER, agentType, writer: ZERO });
    sessions.put({ agentId: id, name, owner: OWNER, encryptionKey: KEY, agentPrivateKey: KEY, expiresAt: nowS() + 3600 });
  }
  chain.edges.push({ id: 1n, from: CLAUDE, to: DEEPSEEK, topicHash: topicHash(ALL_TOPICS), expiresAt: BigInt(nowS() + 3600), active: true });

  const app = createApp({ corsOrigins: [], tokens, verifySignature: async () => false, probes: { rpc: async () => true, supabase: async () => true }, sessions, chain, store: new InMemoryCiphertextStore(), writer });
  server = app.listen(0);
  const mcpUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
  hive.claude = new HiveClient({ mcpUrl, agentToken: (await tokens.signAgent(CLAUDE, OWNER)).token });
  hive.deepseek = new HiveClient({ mcpUrl, agentToken: (await tokens.signAgent(DEEPSEEK, OWNER)).token });
});
afterAll(async () => {
  await Promise.all(Object.values(hive).map((c) => c.close()));
  await new Promise<void>((r) => server.close(() => r()));
});

it("a DeepSeek agent lists and reads what Claude shared over an all-topics edge", async () => {
  await hive.claude!.writeMemory({ topic: "work", content: "Launch moved to Friday" });

  // A scripted model: list, read the slot the list returned, then answer with what the read returned.
  const complete: Complete = async (messages) => {
    const toolReplies = messages.filter((m): m is Extract<ChatMessage, { role: "tool" }> => m.role === "tool");
    const tool = (id: string, name: string, args: object): AssistantMessage => ({ role: "assistant", content: null, tool_calls: [{ id, type: "function", function: { name, arguments: JSON.stringify(args) } }] });
    if (toolReplies.length === 0) return tool("c1", "hive_list_memory", {});
    if (toolReplies.length === 1) return tool("c2", "hive_read_memory", { slotIds: [JSON.parse(toolReplies[0]!.content).memories[0].slotId] });
    return { role: "assistant", content: JSON.parse(toolReplies[1]!.content).memories[0].content };
  };

  const tools = toFunctionTools(await hive.deepseek!.listTools());
  const messages: ChatMessage[] = [{ role: "user", content: "What did Claude share?" }];
  expect(await runTurn({ complete, hive: hive.deepseek!, tools, messages })).toBe("Launch moved to Friday");
});
