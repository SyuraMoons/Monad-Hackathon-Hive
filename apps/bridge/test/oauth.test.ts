import { createHash } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { authMessage, zAuthChallengeResponse, type Hex } from "@hive/shared";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import request from "supertest";
import { verifyMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, type AppDeps } from "../src/app.js";
import { ChallengeStore } from "../src/auth.js";
import { SessionStore } from "../src/sessions.js";
import { InMemoryChain, InMemoryCiphertextStore, InMemoryVaultStore } from "../src/stubs.js";
import { TokenService } from "../src/tokens.js";

const SECRET = "s".repeat(40);
const BASE = "https://bridge.example";
const WEB = "https://app.example";
const CLAUDE_CB = "https://claude.ai/api/mcp/auth_callback";
const CHATGPT_CB = "https://chatgpt.com/connector_platform_oauth_redirect";
const CHATGPT_CONNECTOR_CB = "https://chatgpt.com/connector/oauth/cb_abc-123_X";
const owner = privateKeyToAccount(("0x" + "ab".repeat(32)) as Hex);
const stranger = privateKeyToAccount(("0x" + "cd".repeat(32)) as Hex);
const AGENT_KEY = ("0x" + "11".repeat(32)) as Hex;
const ENC_KEY = ("0x" + "33".repeat(32)) as Hex;
const agentAddress = privateKeyToAccount(AGENT_KEY).address;

const VERIFIER = "v".repeat(43);
const challengeOf = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");
const CHALLENGE = challengeOf(VERIFIER);

let clock = 1_700_000_000;
const now = () => clock;

let chain: InMemoryChain;
let sessions: SessionStore;
let app: ReturnType<typeof createApp>;
let server: Server | undefined;

const deps = (over: Partial<AppDeps> = {}): AppDeps => ({
  corsOrigins: [],
  tokens: new TokenService(SECRET, now),
  challenges: new ChallengeStore(now),
  verifySignature: ({ owner: o, message, signature }) => verifyMessage({ address: o as Hex, message, signature }),
  probes: { rpc: async () => true, supabase: async () => false },
  sessions,
  chain,
  store: new InMemoryCiphertextStore(),
  vaults: new InMemoryVaultStore(),
  writer: { write: async () => { throw new Error("not used here"); } },
  publicUrl: BASE,
  webUrl: WEB,
  now: () => BigInt(clock),
  ...over,
});

beforeEach(() => {
  clock = 1_700_000_000;
  chain = new InMemoryChain();
  sessions = new SessionStore(now);
  app = createApp(deps());
  chain.agents.set(1n, { id: 1n, name: "Claude", owner: owner.address, agentType: "claude", writer: agentAddress });
  chain.agents.set(2n, { id: 2n, name: "Other", owner: stranger.address, agentType: "claude", writer: agentAddress });
});
afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));

async function signIn(who = owner) {
  const c = zAuthChallengeResponse.parse((await request(app).post("/v1/auth/challenge").send({ owner: who.address })).body);
  const signature = await who.signMessage({ message: authMessage(who.address, c.nonce) });
  return `Bearer ${(await request(app).post("/v1/auth/verify").send({ owner: who.address, nonce: c.nonce, signature })).body.userToken}`;
}

/** What the web page does before it approves: hand the bridge the agent's keys. */
const authorizeAgent = async (id: number, auth: string) =>
  request(app).post(`/v1/agents/${id}/authorize`).set("Authorization", auth).send({ agentPrivateKey: AGENT_KEY, encryptionKey: ENC_KEY });

async function register(redirectUris = [CLAUDE_CB]) {
  const res = await request(app).post("/oauth/register").send({ redirect_uris: redirectUris });
  return res.body.client_id as string;
}

const params = (clientId: string, over: Record<string, string> = {}) => ({
  response_type: "code",
  client_id: clientId,
  redirect_uri: CLAUDE_CB,
  code_challenge: CHALLENGE,
  code_challenge_method: "S256",
  state: "xyz",
  ...over,
});

const approve = (auth: string, clientId: string, body: Record<string, unknown> = {}, req: Record<string, string> = {}) =>
  request(app).post("/v1/oauth/approve").set("Authorization", auth).send({ request: params(clientId, req), decision: "allow", agentId: "1", ...body });

/** Registers, authorizes the agent and approves: returns what Claude would hold after the redirect. */
async function getCode(redirectUri = CLAUDE_CB) {
  const auth = await signIn();
  await authorizeAgent(1, auth);
  const clientId = await register([redirectUri]);
  const res = await approve(auth, clientId, {}, { redirect_uri: redirectUri });
  const code = new URL(res.body.redirectTo).searchParams.get("code") as string;
  return { auth, clientId, code, redirectUri };
}

const token = (body: Record<string, string>) => request(app).post("/oauth/token").type("form").send(body);
const exchange = (c: { clientId: string; code: string; redirectUri: string }, over: Record<string, string> = {}) =>
  token({ grant_type: "authorization_code", client_id: c.clientId, code: c.code, redirect_uri: c.redirectUri, code_verifier: VERIFIER, ...over });

describe("discovery", () => {
  it("names the bridge's /mcp as the protected resource and requires PKCE S256", async () => {
    const resource = (await request(app).get("/.well-known/oauth-protected-resource")).body;
    expect(resource.resource).toBe(`${BASE}/mcp`);
    expect(resource.authorization_servers).toEqual([BASE]);
    expect((await request(app).get("/.well-known/oauth-protected-resource/mcp")).body.resource).toBe(`${BASE}/mcp`);

    const meta = (await request(app).get("/.well-known/oauth-authorization-server")).body;
    expect(meta.issuer).toBe(BASE);
    expect(meta.registration_endpoint).toBe(`${BASE}/oauth/register`);
    expect(meta.code_challenge_methods_supported).toEqual(["S256"]);
    expect(meta.token_endpoint_auth_methods_supported).toEqual(["none"]);
    expect(meta.authorization_response_iss_parameter_supported).toBe(true);
  });

  it("answers an unauthenticated /mcp call with a 401 that points at the metadata", async () => {
    const res = await request(app).post("/mcp").send({});
    expect(res.status).toBe(401);
    expect(res.headers["www-authenticate"]).toBe(`Bearer resource_metadata="${BASE}/.well-known/oauth-protected-resource"`);
  });

  it("stays off when the web URL is not set", async () => {
    app = createApp(deps({ webUrl: undefined }));
    expect((await request(app).get("/.well-known/oauth-authorization-server")).status).toBe(404);
    const res = await request(app).post("/mcp").send({});
    expect(res.status).toBe(401);
    expect(res.headers["www-authenticate"]).toBeUndefined();
  });
});

describe("POST /oauth/register", () => {
  it("registers Claude's callback and loopback URLs", async () => {
    const res = await request(app).post("/oauth/register").send({ redirect_uris: [CLAUDE_CB, "http://localhost:3118/callback"] });
    expect(res.status).toBe(201);
    expect(res.body.token_endpoint_auth_method).toBe("none");
    expect(typeof res.body.client_id).toBe("string");
  });

  it("registers ChatGPT's stable and per-connector callbacks", async () => {
    const res = await request(app).post("/oauth/register").send({ redirect_uris: [CHATGPT_CB, CHATGPT_CONNECTOR_CB] });
    expect(res.status).toBe(201);
    expect(res.body.redirect_uris).toEqual([CHATGPT_CB, CHATGPT_CONNECTOR_CB]);
  });

  it("refuses any other redirect URI", async () => {
    const lookalikes = [
      "https://chatgpt.com/other",
      "https://chatgpt.com/connector/oauth/a/b",
      "https://chatgpt.com/connector/oauth/x?y=1",
      "https://chatgpt.com/connector/oauth/x#y",
      "https://chatgpt.com/connector/oauth/",
      "https://chatgpt.com/connector_platform_oauth_redirect/extra",
      "https://chatgpt.com.evil.example/connector_platform_oauth_redirect",
      "https://evil.example/connector_platform_oauth_redirect",
      "http://chatgpt.com/connector_platform_oauth_redirect",
    ];
    for (const uri of [...lookalikes, "https://evil.example/cb", "http://evil.example/cb", "https://claude.ai/other", "javascript:alert(1)", "http://localhost:1/cb#x"]) {
      const res = await request(app).post("/oauth/register").send({ redirect_uris: [uri] });
      expect(res.status, uri).toBe(400);
      expect(res.body.error).toBe("invalid_redirect_uri");
    }
    expect((await request(app).post("/oauth/register").send({})).status).toBe(400);
  });

  it("keeps a client id valid across a restart because it is signed, not stored", async () => {
    const clientId = await register();
    app = createApp(deps({ sessions: new SessionStore(now) }));
    const res = await request(app).get("/oauth/authorize").query(params(clientId));
    expect(res.status).toBe(302);
  });
});

describe("GET /oauth/authorize", () => {
  it("sends the owner to the web consent page with the request unchanged", async () => {
    const clientId = await register();
    const res = await request(app).get("/oauth/authorize").query(params(clientId));
    expect(res.status).toBe(302);
    const to = new URL(res.headers.location);
    expect(`${to.origin}${to.pathname}`).toBe(`${WEB}/oauth/authorize`);
    expect(to.searchParams.get("client_id")).toBe(clientId);
    expect(to.searchParams.get("redirect_uri")).toBe(CLAUDE_CB);
    expect(to.searchParams.get("code_challenge")).toBe(CHALLENGE);
    expect(to.searchParams.get("state")).toBe("xyz");
  });

  it("never redirects to an unknown client or an unregistered redirect URI", async () => {
    const clientId = await register();
    const unknown = await request(app).get("/oauth/authorize").query(params("not-a-client"));
    expect(unknown.status).toBe(400);
    expect(unknown.headers.location).toBeUndefined();
    const other = await request(app).get("/oauth/authorize").query(params(clientId, { redirect_uri: "https://evil.example/cb" }));
    expect(other.status).toBe(400);
    expect(other.headers.location).toBeUndefined();
  });

  it("sends a malformed request back to the client as invalid_request", async () => {
    const clientId = await register();
    const res = await request(app).get("/oauth/authorize").query(params(clientId, { code_challenge_method: "plain" }));
    expect(res.status).toBe(302);
    const to = new URL(res.headers.location);
    expect(`${to.origin}${to.pathname}`).toBe(CLAUDE_CB);
    expect(to.searchParams.get("error")).toBe("invalid_request");
    expect(to.searchParams.get("state")).toBe("xyz");
    expect(to.searchParams.get("iss")).toBe(BASE);
  });

  it("lets a loopback redirect use a different port than the one registered", async () => {
    const clientId = await register(["http://localhost:3118/callback"]);
    const ok = await request(app).get("/oauth/authorize").query(params(clientId, { redirect_uri: "http://localhost:50123/callback" }));
    expect(ok.status).toBe(302);
    const wrongPath = await request(app).get("/oauth/authorize").query(params(clientId, { redirect_uri: "http://localhost:50123/steal" }));
    expect(wrongPath.status).toBe(400);
  });
});

describe("POST /v1/oauth/approve", () => {
  it("needs a user token", async () => {
    const clientId = await register();
    const res = await request(app).post("/v1/oauth/approve").send({ request: params(clientId), decision: "allow", agentId: "1" });
    expect(res.status).toBe(401);
  });

  it("returns access_denied with the state when the owner refuses", async () => {
    const auth = await signIn();
    const res = await approve(auth, await register(), { decision: "deny", agentId: undefined });
    expect(res.status).toBe(200);
    const to = new URL(res.body.redirectTo);
    expect(to.searchParams.get("error")).toBe("access_denied");
    expect(to.searchParams.get("state")).toBe("xyz");
    expect(to.searchParams.get("iss")).toBe(BASE);
    expect(to.searchParams.get("code")).toBeNull();
  });

  it("refuses an agent with no live session, and an agent of another owner", async () => {
    const auth = await signIn();
    const clientId = await register();
    expect((await approve(auth, clientId)).status).toBe(403);

    await authorizeAgent(1, auth);
    expect((await approve(auth, clientId, { agentId: "2" })).status).toBe(403);
    expect((await approve(auth, clientId, { agentId: undefined })).status).toBe(400);
  });

  it("refuses an unknown client or a redirect URI the client did not register", async () => {
    const auth = await signIn();
    await authorizeAgent(1, auth);
    expect((await approve(auth, "not-a-client")).status).toBe(400);
    expect((await approve(auth, await register(), {}, { redirect_uri: "https://evil.example/cb" })).status).toBe(400);
  });

  it("returns a code and the state for a live session the owner owns", async () => {
    const auth = await signIn();
    await authorizeAgent(1, auth);
    const res = await approve(auth, await register());
    expect(res.status).toBe(200);
    const to = new URL(res.body.redirectTo);
    expect(`${to.origin}${to.pathname}`).toBe(CLAUDE_CB);
    expect(to.searchParams.get("code")).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(to.searchParams.get("state")).toBe("xyz");
    expect(to.searchParams.get("iss")).toBe(BASE);
  });
});

describe("POST /oauth/token", () => {
  it("exchanges a code for an agent token that is good for the session's lifetime", async () => {
    const c = await getCode();
    const res = await exchange(c);
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.token_type).toBe("Bearer");
    expect(res.body.expires_in).toBe(24 * 60 * 60);
    expect(typeof res.body.refresh_token).toBe("string");
    const claims = await new TokenService(SECRET, now).verifyAgent(res.body.access_token);
    expect(claims.agentId).toBe(1n);
    expect(claims.owner.toLowerCase()).toBe(owner.address.toLowerCase());
  });

  it("completes the flow for ChatGPT's callbacks, including a resource parameter", async () => {
    for (const cb of [CHATGPT_CB, CHATGPT_CONNECTOR_CB]) {
      const auth = await signIn();
      await authorizeAgent(1, auth);
      const clientId = await register([cb]);
      const authorize = await request(app).get("/oauth/authorize").query(params(clientId, { redirect_uri: cb, resource: `${BASE}/mcp` }));
      expect(authorize.status, cb).toBe(302);
      const approved = await approve(auth, clientId, {}, { redirect_uri: cb, resource: `${BASE}/mcp` });
      const to = new URL(approved.body.redirectTo);
      expect(`${to.origin}${to.pathname}`).toBe(cb);
      const code = to.searchParams.get("code") as string;
      const res = await exchange({ clientId, code, redirectUri: cb });
      expect(res.status, cb).toBe(200);
      expect(res.body.token_type).toBe("Bearer");
    }
  });

  it("refuses a wrong verifier, a replayed code, another redirect URI and another client", async () => {
    const wrong = await getCode();
    const res1 = await exchange(wrong, { code_verifier: "w".repeat(43) });
    expect(res1.status).toBe(400);
    expect(res1.body.error).toBe("invalid_grant");
    // a failed attempt burns the code
    expect((await exchange(wrong)).body.error).toBe("invalid_grant");

    const reused = await getCode();
    expect((await exchange(reused)).status).toBe(200);
    expect((await exchange(reused)).body.error).toBe("invalid_grant");

    const redirect = await getCode();
    expect((await exchange(redirect, { redirect_uri: "https://claude.ai/api/mcp/other" })).body.error).toBe("invalid_grant");

    const client = await getCode();
    // a different redirect list makes a different signed client id even under a frozen clock
    const otherClient = await register([CLAUDE_CB, "http://localhost:1/cb"]);
    expect((await exchange(client, { client_id: otherClient })).body.error).toBe("invalid_grant");
  });

  it("expires a code after 60 seconds", async () => {
    const c = await getCode();
    clock += 61;
    expect((await exchange(c)).body.error).toBe("invalid_grant");
  });

  it("rejects an unknown client, a missing verifier and an unsupported grant", async () => {
    const c = await getCode();
    expect((await exchange(c, { client_id: "nope" })).status).toBe(401);
    expect((await exchange(c, { code_verifier: "short" })).body.error).toBe("invalid_request");
    expect((await token({ grant_type: "client_credentials", client_id: c.clientId })).body.error).toBe("unsupported_grant_type");
  });

  it("does not issue a token once the agent session is gone", async () => {
    const c = await getCode();
    sessions.delete(1n);
    expect((await exchange(c)).body.error).toBe("invalid_grant");
  });

  it("matches a loopback redirect with the port Claude Code used", async () => {
    const c = await getCode("http://localhost:3118/callback");
    expect((await exchange(c)).status).toBe(200);
  });
});

describe("refresh tokens", () => {
  const refresh = (clientId: string, refreshToken: string) => token({ grant_type: "refresh_token", client_id: clientId, refresh_token: refreshToken });

  it("rotates: the new pair works and the old refresh token does not", async () => {
    const c = await getCode();
    const first = (await exchange(c)).body;
    const second = await refresh(c.clientId, first.refresh_token);
    expect(second.status).toBe(200);
    expect(second.body.refresh_token).not.toBe(first.refresh_token);
    expect((await refresh(c.clientId, first.refresh_token)).body.error).toBe("invalid_grant");
    expect((await refresh(c.clientId, second.body.refresh_token)).status).toBe(200);
  });

  it("does not extend the session: expires_in counts down to the agent session's end", async () => {
    const c = await getCode();
    const first = (await exchange(c)).body;
    clock += 3600;
    const second = (await refresh(c.clientId, first.refresh_token)).body;
    expect(second.expires_in).toBe(24 * 60 * 60 - 3600);
  });

  it("answers invalid_grant once the agent is disconnected or its session expired", async () => {
    const a = await getCode();
    const tokensA = (await exchange(a)).body;
    expect((await request(app).delete("/v1/agents/1/session").set("Authorization", a.auth)).status).toBeLessThan(300);
    expect((await refresh(a.clientId, tokensA.refresh_token)).body.error).toBe("invalid_grant");

    const b = await getCode();
    const tokensB = (await exchange(b)).body;
    clock += 24 * 60 * 60 + 1;
    expect((await refresh(b.clientId, tokensB.refresh_token)).body.error).toBe("invalid_grant");
  });

  it("refuses a refresh token from another client", async () => {
    const c = await getCode();
    const first = (await exchange(c)).body;
    expect((await refresh(await register([CLAUDE_CB, "http://localhost:1/cb"]), first.refresh_token)).body.error).toBe("invalid_grant");
  });
});

describe("the issued token on /mcp", () => {
  it("lets the SDK client call tools as the agent the owner picked", async () => {
    server = app.listen(0);
    const url = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`);
    const c = await getCode();
    const { access_token } = (await exchange(c)).body;

    const client = new Client({ name: "test", version: "0.0.0" });
    await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${access_token}` } } }));
    const who = (await client.callTool({ name: "hive_whoami", arguments: {} })).structuredContent as { agentId: string; name: string };
    expect(who.agentId).toBe("1");
    expect(who.name).toBe("Claude");
    await client.close();
  });
});
