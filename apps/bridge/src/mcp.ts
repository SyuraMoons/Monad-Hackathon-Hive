import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { HiveError, zReadMemoryInput, zWriteMemoryInput, type WhoamiOutput } from "@hive/shared";
import type { Request, Response } from "express";
import { getAddress } from "viem";
import type { EventBus } from "./events.js";
import { readMemory, writeMemory } from "./memory.js";
import type { SessionStore, AgentSession } from "./sessions.js";
import type { TokenService } from "./tokens.js";
import type { ChainReader, ChainWriter, CiphertextStore } from "./types.js";

export type McpDeps = {
  tokens: TokenService;
  sessions: SessionStore;
  chain: ChainReader;
  store: CiphertextStore;
  writer: ChainWriter;
  now: () => bigint;
  /** Where `agent.connected`, `memory.written` and `memory.read` go. Default: nowhere. */
  events?: EventBus;
};

// JSON has no bigint: uint256 values go out as decimal strings, like everywhere else in the API.
const json = (value: unknown) => JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
const result = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(json(value)) }], structuredContent: json(value) });
const failure = (message: string) => ({ isError: true, content: [{ type: "text" as const, text: message }] });

function buildServer(deps: McpDeps, session: AgentSession): McpServer {
  const server = new McpServer({ name: "hive-bridge", version: "0.0.0" });

  server.registerTool("hive_write_memory", { description: "Write a memory under a topic. It reaches only agents with a matching, unexpired permission edge from you.", inputSchema: zWriteMemoryInput.shape }, async (input) => {
    try {
      const out = await writeMemory(
        { writer: deps.writer, store: deps.store, agentKey: session.agentPrivateKey, encryptionKey: session.encryptionKey, owner: getAddress(session.owner), onError: (stage) => console.error(`bridge: write failed at ${stage}`) },
        { agentId: session.agentId, content: input.content, topic: input.topic },
      );
      deps.events?.publish(session.owner, {
        type: "memory.written",
        data: { slotId: out.slotId.toString(), agentId: session.agentId.toString(), topic: input.topic, contentHash: out.contentHash, txHash: out.txHash, propagatedTo: out.propagatedTo.map(String) },
      });
      return result(out);
    } catch (e) {
      // HiveError messages are fixed strings, safe to show the agent. Anything else stays generic.
      return failure(e instanceof HiveError ? e.message : "Could not write the memory.");
    }
  });

  server.registerTool("hive_read_memory", { description: "Read memories other agents have shared with you. Permissions are checked on live chain state at every call.", inputSchema: zReadMemoryInput.shape }, async (input) => {
    const out = await readMemory(
      { chain: deps.chain, store: deps.store, encryptionKey: session.encryptionKey, now: deps.now, onError: (stage) => console.error(`bridge: read failed at ${stage}`) },
      { agentId: session.agentId, since: input.since, topic: input.topic },
    );
    if (out.memories.length) {
      const from = [...new Set(out.memories.map((m) => m.fromAgentId.toString()))];
      deps.events?.publish(session.owner, { type: "memory.read", data: { readerAgentId: session.agentId.toString(), fromAgentIds: from, count: out.memories.length } });
    }
    return result(out);
  });

  server.registerTool("hive_whoami", { description: "Who you are in Hive and when your session ends.", inputSchema: {} }, async () => {
    const agent = await deps.chain.agent(session.agentId);
    // STUB: readableTopics needs topic text, but KnowledgeGraph stores only keccak256(topic). Fill from EdgeAdded logs or Envio.
    const out: WhoamiOutput = { agentId: session.agentId, name: agent.name, owner: getAddress(session.owner), tokenExpiresAt: session.expiresAt, readableTopics: [] };
    return result(out);
  });

  return server;
}

/** `POST /mcp`, stateless Streamable HTTP. The agent is identified by its bearer token and a live in-memory session. */
export function mcpHandler(deps: McpDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) throw new HiveError("UNAUTHORIZED", "Missing bearer token.");
    const claims = await deps.tokens.verifyAgent(token);
    const session = deps.sessions.get(claims.agentId);
    if (!session || session.owner.toLowerCase() !== claims.owner.toLowerCase()) throw new HiveError("UNAUTHORIZED", "No active session for this agent. Authorize it again.");
    const first = session.lastCallAt === null;
    deps.sessions.touch(claims.agentId);
    if (first) deps.events?.publish(session.owner, { type: "agent.connected", data: { agentId: claims.agentId.toString() } });

    const server = buildServer(deps, session);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  };
}
