import {
  ERC8004_REGISTRATION_TYPE, HiveError, hiveDeployment, zAgentId, zAgentType, zAgentsResponse, zAuthChallengeBody, zAuthVerifyBody, zAuthorizeBody, zContentHash, zCredentialId, zPutVaultBody, monadTestnet,
  type AgentCardWire, type VaultResponse, type AuthChallengeResponse, type AuthVerifyResponse, type AuthorizeResponse, type Hex, type HealthResponse, type MemoryResponse,
} from "@hive/shared";
import type { z } from "zod";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { privateKeyToAddress } from "viem/accounts";
import express, { type ErrorRequestHandler, type Express, type Request, type RequestHandler, type Response } from "express";
import swaggerUi from "swagger-ui-express";
import { ChallengeStore, verifySignIn, type VerifySignature } from "./auth.js";
import { EventBus } from "./events.js";
import { noGasFunder, type GasFunder } from "./funder.js";
import { mcpHandler } from "./mcp.js";
import { mountOAuth, wwwAuthenticate } from "./oauth.js";
import { buildOpenApi } from "./openapi.js";
import type { SessionStore } from "./sessions.js";
import type { TokenService, UserClaims } from "./tokens.js";
import { UnknownAgentError, type ChainAgent, type ChainReader, type ChainWriter, type CiphertextStore, type Embedder, type VaultStore, type VectorStore } from "./types.js";

export type AppDeps = {
  corsOrigins: string[];
  tokens: TokenService;
  verifySignature: VerifySignature;
  challenges?: ChallengeStore;
  /** Cheap reachability probes for /health. Unconfigured services report false. */
  probes: { rpc: () => Promise<boolean>; supabase: () => Promise<boolean> };
  sessions: SessionStore;
  chain: ChainReader;
  store: CiphertextStore;
  writer: ChainWriter;
  vaults: VaultStore;
  /** Tops up an agent key's gas on authorize (ADR-007). Default: no top-up. */
  funder?: GasFunder;
  /** Search by meaning (ADR-022). Both unset: search ranks on words only and /health says `off`. */
  embeddings?: { embedder: Embedder; vectors: VectorStore; minSimilarity: number };
  /** Feeds GET /v1/events. Default: a fresh in-memory bus. */
  events?: EventBus;
  /** Public base URL for `mcpUrl`. Default: taken from the request. */
  publicUrl?: string;
  /** Web app origin. With `publicUrl` it turns on OAuth for claude.ai connectors (ADR-019). */
  webUrl?: string;
  now?: () => bigint;
  version?: string;
};

const STATUS = { UNAUTHORIZED: 401, SESSION_EXPIRED: 401, FORBIDDEN: 403, NOT_FOUND: 404, INVALID_INPUT: 400, RATE_LIMITED: 429, CHAIN_ERROR: 502, STORAGE_ERROR: 502, INTERNAL: 500 } as const;

const wrap = (fn: (req: Request, res: Response) => Promise<void>): RequestHandler => (req, res, next) => {
  fn(req, res).catch(next);
};

export function createApp(deps: AppDeps): Express {
  const app = express();
  const challenges = deps.challenges ?? new ChallengeStore();
  const allowed = new Set(deps.corsOrigins);
  const events = deps.events ?? new EventBus();

  app.disable("x-powered-by");
  // Behind a TLS proxy (Railway), so a derived mcpUrl says https.
  app.set("trust proxy", 1);
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowed.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Last-Event-ID");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });
  app.use(express.json({ limit: "64kb" }));

  /** Every /v1 route except auth goes through this (default deny). */
  const requireUser: RequestHandler = (req, res, next) => {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) return next(new HiveError("UNAUTHORIZED", "Missing bearer token."));
    deps.tokens.verifyUser(token).then((user) => {
      res.locals.user = user;
      next();
    }, next);
  };

  app.get("/health", wrap(async (_req, res) => {
    const settle = (p: () => Promise<boolean>) => p().catch(() => false);
    const [rpcReachable, supabaseReachable] = await Promise.all([settle(deps.probes.rpc), settle(deps.probes.supabase)]);
    const body: HealthResponse = { ok: true, chainId: monadTestnet.id, rpcReachable, supabaseReachable, activeSessions: deps.sessions.count(), embeddings: deps.embeddings?.embedder.status() ?? "off", version: deps.version ?? "0.0.0" };
    res.json(body);
  }));

  app.post("/v1/auth/challenge", wrap(async (req, res) => {
    const parsed = zAuthChallengeBody.safeParse(req.body);
    if (!parsed.success) throw new HiveError("INVALID_INPUT", "Expected { owner } with a valid address.");
    const body: AuthChallengeResponse = challenges.issue(parsed.data.owner);
    res.json(body);
  }));

  app.post("/v1/auth/verify", wrap(async (req, res) => {
    const parsed = zAuthVerifyBody.safeParse(req.body);
    if (!parsed.success) throw new HiveError("INVALID_INPUT", "Expected { owner, nonce, signature }.");
    await verifySignIn(challenges, deps.verifySignature, parsed.data);
    const { token, expiresAt } = await deps.tokens.signUser(parsed.data.owner);
    const body: AuthVerifyResponse = { userToken: token, expiresAt };
    res.json(body);
  }));

  app.post("/mcp", wrap(mcpHandler({ tokens: deps.tokens, sessions: deps.sessions, chain: deps.chain, store: deps.store, writer: deps.writer, funder: deps.funder, embeddings: deps.embeddings, events, now: deps.now ?? (() => BigInt(Math.floor(Date.now() / 1000))) })));
  // Stateless transport: no SSE stream to open and no session to end. SDK clients expect 405 here, not 404.
  app.all("/mcp", (_req, res) => {
    res.setHeader("Allow", "POST");
    res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
  });

  // Public on purpose: a new device has no token before it can sign in. Returns only the vault ciphertext, never the owner.
  app.get("/v1/vaults/:credentialId", wrap(async (req, res) => {
    const id = zCredentialId.safeParse(req.params.credentialId);
    if (!id.success) throw new HiveError("INVALID_INPUT", "Invalid credential id.");
    const vault = await deps.vaults.get(id.data).catch(() => {
      throw new HiveError("STORAGE_ERROR", "Could not read the vault.");
    });
    if (!vault) throw new HiveError("NOT_FOUND", "No vault for that credential.");
    const body: VaultResponse = { vault };
    res.json(body);
  }));

  app.put("/v1/vaults/:credentialId", requireUser, wrap(async (req, res) => {
    const id = zCredentialId.safeParse(req.params.credentialId);
    if (!id.success) throw new HiveError("INVALID_INPUT", "Invalid credential id.");
    const body = zPutVaultBody.safeParse(req.body);
    if (!body.success) throw new HiveError("INVALID_INPUT", "Expected { vault } as a JSON object.");
    const user = res.locals.user as UserClaims;
    const result = await deps.vaults.put(id.data, user.owner as Hex, body.data.vault).catch(() => {
      throw new HiveError("STORAGE_ERROR", "Could not store the vault.");
    });
    if (result === "forbidden") throw new HiveError("FORBIDDEN", "That vault belongs to another owner.");
    res.sendStatus(result === "created" ? 201 : 204);
  }));

  const ZERO = "0x0000000000000000000000000000000000000000";
  const funder = deps.funder ?? noGasFunder;

  /** "No such agent" is a 404, anything else the chain says is a 502. Never echoes the underlying error. */
  const readAgent = async (id: bigint): Promise<ChainAgent> => {
    try {
      return await deps.chain.agent(id);
    } catch (e) {
      if (e instanceof UnknownAgentError) throw new HiveError("NOT_FOUND", "No such agent.");
      throw new HiveError("CHAIN_ERROR", "Could not read the agent registry.");
    }
  };

  // Public on purpose: this is the file an agent's ERC-8004 URI points to (ADR-028). Built from AgentRegistry alone,
  // which is public onchain (ADR-023): no session state, no keys, nothing from a memory. The path is `agentCardPath` in @hive/shared.
  app.get("/agents/:id/card.json", wrap(async (req, res) => {
    const id = zAgentId.safeParse(req.params.id);
    if (!id.success) throw new HiveError("INVALID_INPUT", "Agent id must be a decimal integer.");
    const agent = await readAgent(id.data);
    const type = zAgentType.safeParse(agent.agentType);
    const base = (deps.publicUrl ?? `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "");
    const card: AgentCardWire = {
      type: ERC8004_REGISTRATION_TYPE,
      name: agent.name.slice(0, 64) || `Agent ${id.data}`,
      description: "Mindshare agent. It shares memory with other agents only along permission edges its owner signed on Monad testnet.",
      services: [{ name: "MCP", endpoint: `${base}/mcp`, version: LATEST_PROTOCOL_VERSION }],
      x402Support: false,
      // An agent can write once its owner has set a writer key.
      active: agent.writer.toLowerCase() !== ZERO,
      registrations: [],
      supportedTrust: [],
      hive: { chainId: hiveDeployment.chainId, agentRegistry: hiveDeployment.agentRegistry, agentId: id.data.toString(), agentType: type.success ? type.data : "other", owner: agent.owner },
    };
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json(card);
  }));

  app.get("/v1/agents", requireUser, wrap(async (_req, res) => {
    const user = res.locals.user as UserClaims;
    const agents = await deps.chain.agentsOf(user.owner as Hex).catch(() => {
      throw new HiveError("CHAIN_ERROR", "Could not read the agent registry.");
    });
    // uint256 goes out as a decimal string (the wire format zAgentId parses).
    const body: z.input<typeof zAgentsResponse> = agents.map((a) => {
      const session = deps.sessions.get(a.id);
      const type = zAgentType.safeParse(a.agentType);
      return {
        agentId: a.id.toString(),
        name: a.name,
        agentType: type.success ? type.data : "other",
        connected: session?.lastCallAt != null,
        lastCallAt: session?.lastCallAt ?? null,
        tokenExpiresAt: session?.expiresAt ?? null,
      };
    });
    res.json(body);
  }));

  // The owner hands the bridge the agent key and encryption key, and the legacy key if old memories need it (ADR-029).
  // All stay in memory (SessionStore) and are never echoed.
  app.post("/v1/agents/:id/authorize", requireUser, wrap(async (req, res) => {
    const id = zAgentId.safeParse(req.params.id);
    if (!id.success) throw new HiveError("INVALID_INPUT", "Agent id must be a decimal integer.");
    const body = zAuthorizeBody.safeParse(req.body);
    if (!body.success) throw new HiveError("INVALID_INPUT", "Expected { agentPrivateKey, encryptionKey } as 32-byte hex keys, and legacyEncryptionKey the same if given.");
    const user = res.locals.user as UserClaims;

    const agent = await readAgent(id.data);
    if (agent.owner.toLowerCase() !== user.owner.toLowerCase()) throw new HiveError("FORBIDDEN", "That agent belongs to another owner.");
    if (agent.writer.toLowerCase() === ZERO) throw new HiveError("FORBIDDEN", "This agent has no registered writer key yet. Register the key first.");
    const agentAddress = privateKeyToAddress(body.data.agentPrivateKey as Hex);
    if (agent.writer.toLowerCase() !== agentAddress.toLowerCase()) throw new HiveError("FORBIDDEN", "That key is not this agent's registered writer.");

    const { token, expiresAt } = await deps.tokens.signAgent(id.data, user.owner);
    deps.sessions.put({ agentId: id.data, name: agent.name, owner: user.owner, encryptionKey: body.data.encryptionKey as Hex, legacyEncryptionKey: body.data.legacyEncryptionKey as Hex | undefined, agentPrivateKey: body.data.agentPrivateKey as Hex, expiresAt });
    // Best effort: a failed top-up must not block authorize. The first write then reports a chain error.
    await funder.ensureFunded(user.owner, agentAddress).catch(() => console.error("bridge: gas top-up failed"));

    const base = (deps.publicUrl ?? `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "");
    const out: AuthorizeResponse = { agentToken: token, expiresAt, mcpUrl: `${base}/mcp` };
    res.json(out);
  }));

  // Ends the agent's bridge session: its scoped keys leave memory and its token stops working. Owner-only, idempotent.
  app.delete("/v1/agents/:id/session", requireUser, (req, res) => {
    const id = zAgentId.safeParse(req.params.id);
    if (!id.success) throw new HiveError("INVALID_INPUT", "Agent id must be a decimal integer.");
    const session = deps.sessions.get(id.data);
    if (session && session.owner.toLowerCase() !== (res.locals.user as UserClaims).owner.toLowerCase()) throw new HiveError("FORBIDDEN", "That agent belongs to another owner.");
    deps.sessions.delete(id.data);
    if (session) events.publish(session.owner, { type: "agent.disconnected", data: { agentId: id.data.toString() } });
    res.sendStatus(204);
  });

  // Sign-out: ends every session of the signed-in owner, those that never called a tool too, so no scoped key outlives it.
  // A client that only knew the connected agents would leave the others valid for the token's whole life. Idempotent.
  app.delete("/v1/sessions", requireUser, (_req, res) => {
    const owner = (res.locals.user as UserClaims).owner;
    for (const session of deps.sessions.listByOwner(owner)) events.publish(session.owner, { type: "agent.disconnected", data: { agentId: session.agentId.toString() } });
    deps.sessions.deleteByOwner(owner);
    res.sendStatus(204);
  });

  // The owner's own read: ciphertext only, decrypted in the browser with the key it already holds. A row of another owner looks the same as no row.
  app.get("/v1/memory/:contentHash", requireUser, wrap(async (req, res) => {
    const hash = zContentHash.safeParse(req.params.contentHash);
    if (!hash.success) throw new HiveError("INVALID_INPUT", "Content hash must be 32-byte hex.");
    const user = res.locals.user as UserClaims;
    const row = await deps.store.getOwned(hash.data as Hex).catch(() => {
      throw new HiveError("STORAGE_ERROR", "Could not read the memory store.");
    });
    if (!row || row.owner.toLowerCase() !== user.owner.toLowerCase()) throw new HiveError("NOT_FOUND", "No such memory.");
    const out: MemoryResponse = { ciphertext: Buffer.from(row.ciphertext).toString("base64"), iv: Buffer.from(row.iv).toString("base64"), keyId: row.keyId };
    res.setHeader("Cache-Control", "private, no-store");
    res.json(out);
  }));

  // EventSource can't send headers, so the user token travels in the query (docs/backend-handoff.md).
  app.get("/v1/events", wrap(async (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token : undefined;
    if (!token) throw new HiveError("UNAUTHORIZED", "Missing token.");
    const user = await deps.tokens.verifyUser(token);
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" });
    res.write(": ok\n\n");
    const send = (e: { id: string }) => res.write(`id: ${e.id}\ndata: ${JSON.stringify(e)}\n\n`);
    const last = req.headers["last-event-id"];
    const unsubscribe = events.subscribe(user.owner, send, typeof last === "string" ? last : undefined);
    const beat = setInterval(() => res.write(": keep-alive\n\n"), 15_000);
    res.on("close", () => {
      clearInterval(beat);
      unsubscribe();
    });
  }));

  // Public on purpose: it describes shapes, holds no secrets, and lets a new teammate try the API.
  const spec = buildOpenApi(deps.version);
  app.get("/openapi.json", (_req, res) => {
    res.json(spec);
  });
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: "Mindshare Bridge API" }));

  // Off unless both URLs are known: the metadata must name the public URL exactly, and consent lives on the web app.
  const oauthBase = deps.publicUrl && deps.webUrl ? deps.publicUrl.replace(/\/+$/, "") : undefined;
  if (oauthBase && deps.webUrl) mountOAuth(app, { base: oauthBase, webUrl: deps.webUrl, tokens: deps.tokens, sessions: deps.sessions, requireUser, now: deps.now && (() => Number(deps.now!())) });

  app.use((_req, _res, next) => next(new HiveError("NOT_FOUND", "No such route.")));

  // Error bodies carry a code and a fixed message: never request bodies, keys or memory content.
  const onError: ErrorRequestHandler = (err, req, res, _next) => {
    const known = err instanceof HiveError;
    const bad = !known && (err as { type?: string }).type?.startsWith("entity.");
    const e = known ? err : bad ? new HiveError("INVALID_INPUT", "Malformed request body.") : new HiveError("INTERNAL", "Something went wrong.");
    if (!known && !bad) console.error("bridge: unhandled error", (err as Error)?.name);
    // Claude starts its OAuth sign-in only from a 401 that points at the metadata.
    if (oauthBase && req.path === "/mcp" && STATUS[e.code] === 401) res.setHeader("WWW-Authenticate", wwwAuthenticate(oauthBase));
    res.status(STATUS[e.code]).json(e.toEnvelope());
  };
  app.use(onError);
  return app;
}
