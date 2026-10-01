import {
  HiveError, zAuthChallengeBody, zAuthVerifyBody, monadTestnet,
  type AuthChallengeResponse, type AuthVerifyResponse, type HealthResponse,
} from "@hive/shared";
import express, { type ErrorRequestHandler, type Express, type Request, type RequestHandler, type Response } from "express";
import { ChallengeStore, verifySignIn, type VerifySignature } from "./auth.js";
import { mcpHandler } from "./mcp.js";
import type { SessionStore } from "./sessions.js";
import type { TokenService } from "./tokens.js";
import type { ChainReader, CiphertextStore } from "./types.js";

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

  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowed.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Last-Event-ID");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
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
    const body: HealthResponse = { ok: true, chainId: monadTestnet.id, rpcReachable, supabaseReachable, activeSessions: deps.sessions.count(), version: deps.version ?? "0.0.0" };
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

  app.post("/mcp", wrap(mcpHandler({ tokens: deps.tokens, sessions: deps.sessions, chain: deps.chain, store: deps.store, now: deps.now ?? (() => BigInt(Math.floor(Date.now() / 1000))) })));

  // STUB: replace when the agent registry is readable from chain (AK-7). Empty list is a valid response.
  app.get("/v1/agents", requireUser, (_req, res) => {
    res.json([]);
  });

  app.use((_req, _res, next) => next(new HiveError("NOT_FOUND", "No such route.")));

  // Error bodies carry a code and a fixed message: never request bodies, keys or memory content.
  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    const known = err instanceof HiveError;
    const bad = !known && (err as { type?: string }).type?.startsWith("entity.");
    const e = known ? err : bad ? new HiveError("INVALID_INPUT", "Malformed request body.") : new HiveError("INTERNAL", "Something went wrong.");
    if (!known && !bad) console.error("bridge: unhandled error", (err as Error)?.name);
    res.status(STATUS[e.code]).json(e.toEnvelope());
  };
  app.use(onError);
  return app;
}
