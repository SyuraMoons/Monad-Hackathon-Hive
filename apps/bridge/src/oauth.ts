import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { HiveError, zOAuthApproveBody, zOAuthAuthorizeParams, type OAuthApproveResponse } from "@hive/shared";
import express, { type Express, type RequestHandler, type Response } from "express";
import { z } from "zod";
import type { SessionStore } from "./sessions.js";
import type { TokenService, UserClaims } from "./tokens.js";

// The bridge is its own OAuth 2.1 authorization server for the claude.ai and ChatGPT connectors (ADR-019).
// Dynamic client registration is stateless, PKCE S256 is required, and codes and refresh tokens live in memory like
// SessionStore: a restart or an expired agent session means the owner signs in with the passkey again.

const CODE_TTL_S = 60;
const CLAUDE_CALLBACK = "https://claude.ai/api/mcp/auth_callback";
// ChatGPT uses the stable URI when the issuer rules (RFC 9207 `iss`) are met, and a per-connector one otherwise.
const CHATGPT_CALLBACK = "https://chatgpt.com/connector_platform_oauth_redirect";
const CHATGPT_CONNECTOR_CALLBACK = /^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]{1,128}$/;
const LOOPBACK = new Set(["localhost", "127.0.0.1"]);

const sha256 = (s: string) => createHash("sha256").update(s).digest();
const sha256Hex = (s: string) => sha256(s).toString("hex");
const secret = () => randomBytes(32).toString("base64url");

const sameString = (a: string, b: string) => {
  const [x, y] = [Buffer.from(a), Buffer.from(b)];
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Claude's or ChatGPT's hosted callback, or a loopback URL (Claude Code uses a port that changes per session). */
export function isAllowedRedirect(uri: string): boolean {
  if (uri === CLAUDE_CALLBACK || uri === CHATGPT_CALLBACK || CHATGPT_CONNECTOR_CALLBACK.test(uri)) return true;
  try {
    const u = new URL(uri);
    return u.protocol === "http:" && LOOPBACK.has(u.hostname) && !u.username && !u.password && !u.hash;
  } catch {
    return false;
  }
}

/** Exact match, except that a loopback URI may differ in its port (RFC 8252 section 7.3). */
function redirectMatches(registered: string[], requested: string): boolean {
  if (registered.includes(requested)) return true;
  let r: URL;
  try {
    r = new URL(requested);
  } catch {
    return false;
  }
  if (r.protocol !== "http:" || !LOOPBACK.has(r.hostname)) return false;
  return registered.some((u) => {
    try {
      const x = new URL(u);
      return x.protocol === "http:" && x.hostname === r.hostname && x.pathname === r.pathname && x.search === r.search;
    } catch {
      return false;
    }
  });
}

function withParams(uri: string, params: Record<string, string | undefined>): string {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, v);
  return u.toString();
}

type CodeRecord = { clientId: string; redirectUri: string; challenge: string; agentId: bigint; owner: string; expiresAt: number };
type RefreshRecord = { clientId: string; agentId: bigint; owner: string; expiresAt: number };

/** Authorization codes (60 s, single use) and rotating refresh tokens, both keyed by their hash. */
export class OAuthStore {
  private codes = new Map<string, CodeRecord>();
  private refresh = new Map<string, RefreshRecord>();
  constructor(private now: () => number = () => Math.floor(Date.now() / 1000)) {}

  issueCode(rec: Omit<CodeRecord, "expiresAt">): string {
    this.purge();
    const code = secret();
    this.codes.set(sha256Hex(code), { ...rec, expiresAt: this.now() + CODE_TTL_S });
    return code;
  }

  /** Reading a code consumes it, so a replayed code finds nothing. */
  takeCode(code: string): CodeRecord | undefined {
    const key = sha256Hex(code);
    const rec = this.codes.get(key);
    this.codes.delete(key);
    return rec && rec.expiresAt > this.now() ? rec : undefined;
  }

  issueRefresh(rec: Omit<RefreshRecord, "expiresAt">, expiresAt: number): string {
    const token = secret();
    this.refresh.set(sha256Hex(token), { ...rec, expiresAt });
    return token;
  }

  /** Rotation: the old refresh token stops working the moment it is read. */
  takeRefresh(token: string): RefreshRecord | undefined {
    const key = sha256Hex(token);
    const rec = this.refresh.get(key);
    this.refresh.delete(key);
    return rec && rec.expiresAt > this.now() ? rec : undefined;
  }

  private purge(): void {
    const now = this.now();
    for (const [k, v] of this.codes) if (v.expiresAt <= now) this.codes.delete(k);
    for (const [k, v] of this.refresh) if (v.expiresAt <= now) this.refresh.delete(k);
  }
}

export type OAuthDeps = {
  /** Public base URL of the bridge. The protected resource is `${base}/mcp`. */
  base: string;
  /** Web app origin: GET /oauth/authorize sends the owner to `${webUrl}/oauth/authorize`. */
  webUrl: string;
  tokens: TokenService;
  sessions: SessionStore;
  requireUser: RequestHandler;
  store?: OAuthStore;
  now?: () => number;
};

/** The `WWW-Authenticate` value that tells Claude or ChatGPT where to start signing in. They only start on a 401 that carries it. */
export const wwwAuthenticate = (base: string) => `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`;

const zRegistration = z.object({ redirect_uris: z.array(z.string().max(512)).min(1).max(5) });

export function mountOAuth(app: Express, deps: OAuthDeps): void {
  const { base, webUrl, tokens, sessions } = deps;
  const now = deps.now ?? (() => Math.floor(Date.now() / 1000));
  const store = deps.store ?? new OAuthStore(now);

  const oauthError = (res: Response, status: number, error: string, description: string) => {
    res.setHeader("Cache-Control", "no-store");
    res.status(status).json({ error, error_description: description });
  };

  const protectedResource: RequestHandler = (_req, res) => {
    res.json({ resource: `${base}/mcp`, authorization_servers: [base], bearer_methods_supported: ["header"], scopes_supported: ["hive"] });
  };
  app.get(["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"], protectedResource);

  app.get("/.well-known/oauth-authorization-server", (_req, res) => {
    res.json({
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      registration_endpoint: `${base}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["hive"],
      authorization_response_iss_parameter_supported: true,
    });
  });

  // RFC 7591. Stateless: the client id is a signed list of redirect URIs, so there is nothing to store or clean up.
  app.post("/oauth/register", async (req, res) => {
    const body = zRegistration.safeParse(req.body);
    if (!body.success || !body.data.redirect_uris.every(isAllowedRedirect)) {
      oauthError(res, 400, "invalid_redirect_uri", "Redirect URIs must be Claude's or ChatGPT's callback, or a loopback address.");
      return;
    }
    const redirectUris = body.data.redirect_uris;
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json({
      client_id: await tokens.signClient(redirectUris),
      redirect_uris: redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });
  });

  // A bad client or redirect URI is never redirected to (open redirect); the owner sees a plain error instead.
  app.get("/oauth/authorize", async (req, res) => {
    const { client_id: clientId, redirect_uri: redirectUri, state } = req.query;
    const registered = typeof clientId === "string" ? await tokens.verifyClient(clientId) : undefined;
    if (!registered || typeof redirectUri !== "string" || !redirectMatches(registered, redirectUri)) {
      oauthError(res, 400, "invalid_request", "Unknown client or redirect URI.");
      return;
    }
    const params = zOAuthAuthorizeParams.safeParse(req.query);
    if (!params.success) {
      res.redirect(302, withParams(redirectUri, { error: "invalid_request", state: typeof state === "string" ? state : undefined, iss: base }));
      return;
    }
    const to = new URL("/oauth/authorize", webUrl);
    for (const [k, v] of Object.entries(params.data)) if (v !== undefined) to.searchParams.set(k, v);
    res.redirect(302, to.toString());
  });

  // Called by the web consent page. The agent was authorized through the usual /v1/agents/:id/authorize first, so its keys are
  // already in SessionStore: approving only mints a code for a live session the signed-in owner owns.
  app.post("/v1/oauth/approve", deps.requireUser, async (req, res) => {
    const body = zOAuthApproveBody.safeParse(req.body);
    if (!body.success) throw new HiveError("INVALID_INPUT", "Expected { request, decision, agentId }.");
    const { request, decision, agentId } = body.data;
    const registered = await tokens.verifyClient(request.client_id);
    if (!registered || !redirectMatches(registered, request.redirect_uri)) throw new HiveError("INVALID_INPUT", "Unknown client or redirect URI.");

    let redirectTo: string;
    if (decision === "deny") {
      redirectTo = withParams(request.redirect_uri, { error: "access_denied", state: request.state, iss: base });
    } else {
      if (agentId === undefined) throw new HiveError("INVALID_INPUT", "Choose an agent to connect.");
      const user = res.locals.user as UserClaims;
      const session = sessions.get(agentId);
      if (!session || session.owner.toLowerCase() !== user.owner.toLowerCase()) throw new HiveError("FORBIDDEN", "Authorize this agent first, then approve.");
      const code = store.issueCode({ clientId: request.client_id, redirectUri: request.redirect_uri, challenge: request.code_challenge, agentId, owner: session.owner });
      redirectTo = withParams(request.redirect_uri, { code, state: request.state, iss: base });
    }
    const out: OAuthApproveResponse = { redirectTo };
    res.json(out);
  });

  /** A fresh access token plus a rotated refresh token, for as long as the agent's session lives. */
  async function issue(res: Response, clientId: string, agentId: bigint, owner: string): Promise<void> {
    const session = sessions.get(agentId);
    if (!session || session.owner.toLowerCase() !== owner.toLowerCase()) {
      oauthError(res, 400, "invalid_grant", "The agent session ended. Connect again.");
      return;
    }
    const { token } = await tokens.signAgent(agentId, owner);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.json({
      access_token: token,
      token_type: "Bearer",
      expires_in: session.expiresAt - now(),
      refresh_token: store.issueRefresh({ clientId, agentId, owner }, session.expiresAt),
      scope: "hive",
    });
  }

  // Claude and ChatGPT send application/x-www-form-urlencoded here (RFC 6749 section 4.1.3), unlike /oauth/register.
  app.post("/oauth/token", express.urlencoded({ extended: false, limit: "8kb" }), async (req, res) => {
    const field = (k: string) => (typeof req.body?.[k] === "string" ? (req.body[k] as string) : undefined);
    const clientId = field("client_id");
    if (!clientId || !(await tokens.verifyClient(clientId))) {
      oauthError(res, 401, "invalid_client", "Unknown client.");
      return;
    }
    const grant = field("grant_type");

    if (grant === "authorization_code") {
      const [code, redirectUri, verifier] = [field("code"), field("redirect_uri"), field("code_verifier")];
      if (!code || !redirectUri || !verifier || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) {
        oauthError(res, 400, "invalid_request", "Expected code, redirect_uri and a PKCE code_verifier.");
        return;
      }
      const rec = store.takeCode(code);
      const challenge = sha256(verifier).toString("base64url");
      if (!rec || rec.clientId !== clientId || rec.redirectUri !== redirectUri || !sameString(challenge, rec.challenge)) {
        oauthError(res, 400, "invalid_grant", "The code is invalid, used or expired.");
        return;
      }
      await issue(res, clientId, rec.agentId, rec.owner);
      return;
    }

    if (grant === "refresh_token") {
      const refresh = field("refresh_token");
      const rec = refresh ? store.takeRefresh(refresh) : undefined;
      if (!rec || rec.clientId !== clientId) {
        oauthError(res, 400, "invalid_grant", "The refresh token is invalid or expired. Connect again.");
        return;
      }
      await issue(res, clientId, rec.agentId, rec.owner);
      return;
    }

    oauthError(res, 400, "unsupported_grant_type", "Use authorization_code or refresh_token.");
  });
}
