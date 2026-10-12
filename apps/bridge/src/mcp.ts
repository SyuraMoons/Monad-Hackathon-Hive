import { keyIdOf } from "@hive/crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { DEFAULT_TOPIC, HIVE_INSTRUCTIONS, HiveError, zListMemoryInput, zReadMemoryInput, zSaveSessionInput, zSearchMemoryInput, zWriteMemoryInput, type MemoryMeta, type WhoamiOutput, type WriteMemoryOutput } from "@hive/shared";
import type { Request, Response } from "express";
import { getAddress } from "viem";
import { privateKeyToAddress } from "viem/accounts";
import type { GasFunder } from "./funder.js";
import type { EventBus } from "./events.js";
import type { EmbeddingDeps } from "./embeddings.js";
import { listMemory, readMemory, writeMemory, type ReadDeps } from "./memory.js";
import { searchMemory } from "./search.js";
import { looksLikeSecret } from "./secrets.js";
import type { SessionStore, AgentSession } from "./sessions.js";
import type { TokenService } from "./tokens.js";
import type { ChainReader, ChainWriter, CiphertextStore, Embedder, VectorStore } from "./types.js";

export type McpDeps = {
  tokens: TokenService;
  sessions: SessionStore;
  chain: ChainReader;
  store: CiphertextStore;
  writer: ChainWriter;
  /** Tops the agent key up before a write. Default: none. */
  funder?: GasFunder;
  /** Search by meaning (ADR-022). Unset: search ranks on words only. */
  embeddings?: { embedder: Embedder; vectors: VectorStore; minSimilarity: number };
  now: () => bigint;
  /** Where `agent.connected`, `memory.written` and `memory.read` go. Default: nowhere. */
  events?: EventBus;
};

// JSON has no bigint: uint256 values go out as decimal strings, like everywhere else in the API.
const json = (value: unknown) => JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
const result = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(json(value)) }], structuredContent: json(value) });
const failure = (message: string) => ({ isError: true, content: [{ type: "text" as const, text: message }] });

// Sent to every MCP client in `initialize`. The text lives in @hive/shared, shared with the DeepSeek runner.
export { HIVE_INSTRUCTIONS };

const SECRET_MESSAGE = "The gist or an entity looks like it contains a secret. Remove it and try again.";
const metaLooksLikeSecret = (m: MemoryMeta) => [m.gist ?? "", ...(m.entities ?? [])].some(looksLikeSecret);
const metaOf = ({ gist, kind, entities, supersedes }: MemoryMeta): MemoryMeta => ({ gist, kind, entities, supersedes });

function buildServer(deps: McpDeps, session: AgentSession): McpServer {
  // The embedding setup of this session: the owner and key id are the session's, like on a write.
  const embeddings: EmbeddingDeps | undefined = deps.embeddings && { ...deps.embeddings, owner: getAddress(session.owner), keyId: keyIdOf(session.encryptionKey) };
  // Every successful result says who the call ran as, from the token, so a client on the wrong identity shows it in the first answer.
  const answer = (value: object) => result({ ...value, as: { agentId: session.agentId, name: session.name } });
  const server = new McpServer({ name: "hive-bridge", version: "0.0.0" }, { instructions: HIVE_INSTRUCTIONS });

  async function save(topic: string, content: string, meta: MemoryMeta = {}): Promise<WriteMemoryOutput> {
    const out = await writeMemory(
      { chain: deps.chain, docs: session.docs, embeddings, writer: deps.writer, store: deps.store, agentKey: session.agentPrivateKey, encryptionKey: session.encryptionKey, owner: getAddress(session.owner),
        ensureGas: deps.funder ? () => deps.funder!.ensureFunded(session.owner, privateKeyToAddress(session.agentPrivateKey)) : undefined,
        // The error name only: messages can carry addresses and RPC details, and a log must never carry memory content.
        onError: (stage, e) => console.error(`bridge: write failed at ${stage}${e instanceof Error ? ` (${e.name})` : ""}`) },
      { agentId: session.agentId, content, topic, ...meta },
    );
    deps.events?.publish(session.owner, {
      type: "memory.written",
      data: { slotId: out.slotId.toString(), agentId: session.agentId.toString(), topic, contentHash: out.contentHash, txHash: out.txHash, propagatedTo: out.propagatedTo.map(String) },
    });
    return out;
  }

  server.registerTool("hive_write_memory", { description: "Write a memory under a topic. It reaches only agents with a matching, unexpired permission edge from you. Add a one-line `gist` (200 characters), a `kind` (decision, interface, fact, task, session or state) and `entities` (exact names, ids, addresses) so others can find it without reading it. Set `supersedes` to the slotId of your own earlier memory in the same topic to replace it. Keep one `state` memory per topic as its living summary.", inputSchema: zWriteMemoryInput.shape }, async (input) => {
    try {
      if (metaLooksLikeSecret(input)) return failure(SECRET_MESSAGE);
      return answer(await save(input.topic, input.content, metaOf(input)));
    } catch (e) {
      // HiveError messages are fixed strings, safe to show the agent. Anything else stays generic.
      return failure(e instanceof HiveError ? e.message : "Could not write the memory.");
    }
  });

  server.registerTool(
    "hive_save_session",
    {
      description: `Save a compact summary of this conversation to Hive (topic "${DEFAULT_TOPIC}" unless you give one). Cover the goal, decisions, interfaces other agents need and open work, as plain text under 3500 bytes. Never include keys, tokens or passwords.`,
      inputSchema: zSaveSessionInput.shape,
    },
    async (input) => {
      if (looksLikeSecret(input.summary)) return failure("The summary looks like it contains a secret. Remove it and try again.");
      if (metaLooksLikeSecret(input)) return failure(SECRET_MESSAGE);
      const topic = input.topic ?? DEFAULT_TOPIC;
      try {
        return answer({ ...(await save(topic, input.summary, metaOf(input))), topic });
      } catch (e) {
        return failure(e instanceof HiveError ? e.message : "Could not save the session.");
      }
    },
  );

  const readDeps = (): ReadDeps => ({ chain: deps.chain, store: deps.store, encryptionKey: session.encryptionKey, legacyEncryptionKey: session.legacyEncryptionKey, now: deps.now, docs: session.docs, embeddings, onError: (stage) => console.error(`bridge: read failed at ${stage}`) });

  server.registerTool(
    "hive_list_memory",
    { description: "List the newest memories other agents shared with you: id, sender, topic, gist, kind, size and a short preview, without the full content. Replaced memories are left out. Pass the `cursor` from your last call to get only newer ones, oldest first; while `more` is true, call again with the cursor it returns. Then read the ones you need with hive_read_memory and slotIds. Permissions are checked on live chain state at every call.", inputSchema: zListMemoryInput.shape },
    async (input) => answer(await listMemory(readDeps(), { agentId: session.agentId, ...input })),
  );

  server.registerTool("hive_read_memory", { description: "Read the full content of memories other agents shared with you, newest 20 by default. Pass `slotIds` (from hive_list_memory) to read specific ones, and `topic`, `kind` or `cursor` to narrow. `kind: \"state\"` gives each sender's living summary of a topic. `mine: true` reads your own memories instead, for example your own state before you rewrite it. `more` is true when memories were left out: older ones, or newer ones when you passed a `cursor` (call again with the cursor it returns). Permissions are checked on live chain state at every call.", inputSchema: zReadMemoryInput.shape }, async (input) => {
    const out = await readMemory(readDeps(), { agentId: session.agentId, ...input });
    if (out.memories.length && !input.mine) {
      const from = [...new Set(out.memories.map((m) => m.fromAgentId.toString()))];
      deps.events?.publish(session.owner, { type: "memory.read", data: { readerAgentId: session.agentId.toString(), fromAgentIds: from, count: out.memories.length } });
    }
    return answer(out);
  });

  server.registerTool(
    "hive_search_memory",
    {
      description: "Search the memories you may read for what matters to your task, ranked: words, names, ids and addresses match. Returns gist, kind and a short preview, not the full content; read the ones you need with hive_read_memory and slotIds. Replaced memories are left out, and `mine: true` searches your own. Permissions are checked on live chain state at every call.",
      inputSchema: zSearchMemoryInput.shape,
    },
    async (input) => answer(await searchMemory(readDeps(), { agentId: session.agentId, ...input })),
  );

  server.registerTool("hive_whoami", { description: "Who you are in Hive and when your session ends.", inputSchema: {} }, async () => {
    try {
      const agent = await deps.chain.agent(session.agentId);
      // STUB: readableTopics needs topic text, but KnowledgeGraph stores only keccak256(topic). Fill from EdgeAdded logs or Envio.
      const out: WhoamiOutput = { agentId: session.agentId, name: agent.name, owner: getAddress(session.owner), tokenExpiresAt: session.expiresAt, readableTopics: [] };
      return answer(out);
    } catch (e) {
      // The error name only: a viem message carries the RPC URL and addresses, and the SDK would hand it to the agent as is.
      console.error(`bridge: whoami failed at registry${e instanceof Error ? ` (${e.name})` : ""}`);
      return failure("Could not read your agent from the registry.");
    }
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
