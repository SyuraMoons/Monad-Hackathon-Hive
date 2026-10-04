import { authMessage, zAuthChallengeResponse, zAuthVerifyResponse, zErrorEnvelope, zHealthResponse } from "@hive/shared";
import { privateKeyToAccount } from "viem/accounts";
import { verifyMessage } from "viem";
import request from "supertest";
import { SignJWT } from "jose";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { ChallengeStore } from "../src/auth.js";
import { loadConfig } from "../src/config.js";
import { SessionStore } from "../src/sessions.js";
import { InMemoryChain, InMemoryCiphertextStore } from "../src/stubs.js";
import { TokenService } from "../src/tokens.js";

const SECRET = "s".repeat(40);
const ORIGIN = "http://localhost:3100";
const account = privateKeyToAccount(("0x" + "ab".repeat(32)) as `0x${string}`);

let clock = 1_700_000_000;
const now = () => clock;

function build(overrides: Partial<Parameters<typeof createApp>[0]> = {}) {
  const tokens = new TokenService(SECRET, now);
  return createApp({
    corsOrigins: [ORIGIN],
    tokens,
    challenges: new ChallengeStore(now),
    verifySignature: ({ owner, message, signature }) => verifyMessage({ address: owner as `0x${string}`, message, signature }),
    probes: { rpc: async () => true, supabase: async () => false },
    sessions: (() => { const s = new SessionStore(now); for (const id of [1n, 2n]) s.put({ agentId: id, name: "a", owner: account.address, encryptionKey: "0x" + "00".repeat(32) as `0x${string}`, agentPrivateKey: "0x" + "00".repeat(32) as `0x${string}`, expiresAt: clock + 1000 }); return s; })(),
    chain: new InMemoryChain(),
    store: new InMemoryCiphertextStore(),
    writer: { write: async () => { throw new Error("not used here"); } },
    ...overrides,
  });
}

async function signIn(app: ReturnType<typeof build>) {
  const c = zAuthChallengeResponse.parse((await request(app).post("/v1/auth/challenge").send({ owner: account.address })).body);
  const signature = await account.signMessage({ message: authMessage(account.address, c.nonce) });
  return { c, signature, res: await request(app).post("/v1/auth/verify").send({ owner: account.address, nonce: c.nonce, signature }) };
}

beforeEach(() => { clock = 1_700_000_000; });

describe("GET /health", () => {
  it("matches zHealthResponse and reports probes", async () => {
    const res = await request(build()).get("/health");
    expect(res.status).toBe(200);
    expect(zHealthResponse.parse(res.body)).toMatchObject({ ok: true, chainId: 10143, rpcReachable: true, supabaseReachable: false, activeSessions: 2 });
  });

  it("stays 200 when a probe throws, reporting it unreachable", async () => {
    const res = await request(build({ probes: { rpc: async () => { throw new Error("boom"); }, supabase: async () => true } })).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ rpcReachable: false, supabaseReachable: true });
  });
});

describe("sign-in", () => {
  it("challenge -> signed message -> 24 h user token", async () => {
    const { c, res } = await signIn(build());
    expect(res.status).toBe(200);
    const body = zAuthVerifyResponse.parse(res.body);
    expect(body.expiresAt).toBe(clock + 86_400);
    expect(c.expiresAt).toBe(clock + 300);
  });

  it("rejects a signature from another key", async () => {
    const app = build();
    const c = zAuthChallengeResponse.parse((await request(app).post("/v1/auth/challenge").send({ owner: account.address })).body);
    const other = privateKeyToAccount(("0x" + "cd".repeat(32)) as `0x${string}`);
    const signature = await other.signMessage({ message: authMessage(account.address, c.nonce) });
    const res = await request(app).post("/v1/auth/verify").send({ owner: account.address, nonce: c.nonce, signature });
    expect(res.status).toBe(401);
    expect(zErrorEnvelope.parse(res.body).error.code).toBe("UNAUTHORIZED");
  });

  it("a nonce works once, even after a failed attempt", async () => {
    const app = build();
    const { c, signature } = await signIn(app);
    const again = await request(app).post("/v1/auth/verify").send({ owner: account.address, nonce: c.nonce, signature });
    expect(again.status).toBe(401);
  });

  it("rejects an expired challenge", async () => {
    const app = build();
    const c = zAuthChallengeResponse.parse((await request(app).post("/v1/auth/challenge").send({ owner: account.address })).body);
    const signature = await account.signMessage({ message: authMessage(account.address, c.nonce) });
    clock += 301;
    const res = await request(app).post("/v1/auth/verify").send({ owner: account.address, nonce: c.nonce, signature });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("SESSION_EXPIRED");
  });

  it("rejects a nonce issued to a different owner", async () => {
    const app = build();
    const c = zAuthChallengeResponse.parse((await request(app).post("/v1/auth/challenge").send({ owner: account.address })).body);
    const other = privateKeyToAccount(("0x" + "cd".repeat(32)) as `0x${string}`);
    const signature = await other.signMessage({ message: authMessage(other.address, c.nonce) });
    const res = await request(app).post("/v1/auth/verify").send({ owner: other.address, nonce: c.nonce, signature });
    expect(res.status).toBe(401);
  });

  it("returns 400 with the envelope for bad input and malformed JSON", async () => {
    const app = build();
    const bad = await request(app).post("/v1/auth/challenge").send({ owner: "nope" });
    expect(bad.status).toBe(400);
    expect(zErrorEnvelope.parse(bad.body).error.code).toBe("INVALID_INPUT");
    const malformed = await request(app).post("/v1/auth/challenge").set("Content-Type", "application/json").send("{oops");
    expect(malformed.status).toBe(400);
  });
});

describe("JWT guard (default deny)", () => {
  it("401 without a token", async () => {
    const res = await request(build()).get("/v1/agents");
    expect(res.status).toBe(401);
    expect(zErrorEnvelope.parse(res.body).error.code).toBe("UNAUTHORIZED");
  });

  it("401 for garbage, a wrong secret and alg none", async () => {
    const app = build();
    const forged = await new SignJWT({ typ: "user" }).setProtectedHeader({ alg: "HS256" }).setSubject(account.address).setExpirationTime(clock + 100).sign(new TextEncoder().encode("x".repeat(40)));
    for (const t of ["garbage", forged, "eyJhbGciOiJub25lIn0.eyJzdWIiOiIweDEifQ."]) {
      expect((await request(app).get("/v1/agents").set("Authorization", `Bearer ${t}`)).status).toBe(401);
    }
  });

  it("accepts a valid token and rejects it after 24 h with SESSION_EXPIRED", async () => {
    const app = build();
    const { res } = await signIn(app);
    const token = res.body.userToken as string;
    expect((await request(app).get("/v1/agents").set("Authorization", `Bearer ${token}`)).status).toBe(200);
    clock += 86_401;
    const expired = await request(app).get("/v1/agents").set("Authorization", `Bearer ${token}`);
    expect(expired.status).toBe(401);
    expect(expired.body.error.code).toBe("SESSION_EXPIRED");
  });

  it("refuses a token whose typ is not user", async () => {
    const t = await new SignJWT({ typ: "agent" }).setProtectedHeader({ alg: "HS256" }).setSubject(account.address).setExpirationTime(clock + 100).sign(new TextEncoder().encode(SECRET));
    expect((await request(build()).get("/v1/agents").set("Authorization", `Bearer ${t}`)).status).toBe(401);
  });
});

describe("DELETE /v1/agents/:id/session", () => {
  it("needs a token, ends the owner's session, is idempotent, refuses other owners", async () => {
    clock = 1_700_000_000;
    const sessions = new SessionStore(now);
    const key = ("0x" + "00".repeat(32)) as `0x${string}`;
    sessions.put({ agentId: 1n, name: "a", owner: account.address, encryptionKey: key, agentPrivateKey: key, expiresAt: clock + 1000 });
    sessions.put({ agentId: 2n, name: "b", owner: "0x00000000000000000000000000000000000000b2", encryptionKey: key, agentPrivateKey: key, expiresAt: clock + 1000 });
    const app = build({ sessions });
    const token = (await signIn(app)).res.body.userToken as string;
    expect((await request(app).delete("/v1/agents/1/session")).status).toBe(401);
    expect((await request(app).delete("/v1/agents/nope/session").set("Authorization", `Bearer ${token}`)).status).toBe(400);
    expect((await request(app).delete("/v1/agents/2/session").set("Authorization", `Bearer ${token}`)).status).toBe(403);
    expect(sessions.get(2n)).toBeDefined();
    expect((await request(app).delete("/v1/agents/1/session").set("Authorization", `Bearer ${token}`)).status).toBe(204);
    expect(sessions.get(1n)).toBeUndefined();
    expect((await request(app).delete("/v1/agents/1/session").set("Authorization", `Bearer ${token}`)).status).toBe(204);
    expect(sessions.count()).toBe(1);
  });
});

describe("CORS and errors", () => {
  it("allows only the configured origin, answers preflight", async () => {
    const app = build();
    const ok = await request(app).options("/v1/auth/challenge").set("Origin", ORIGIN);
    expect(ok.status).toBe(204);
    expect(ok.headers["access-control-allow-origin"]).toBe(ORIGIN);
    const no = await request(app).get("/health").set("Origin", "https://evil.example");
    expect(no.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("404 uses the envelope", async () => {
    const res = await request(build()).get("/nope");
    expect(res.status).toBe(404);
    expect(zErrorEnvelope.parse(res.body).error.code).toBe("NOT_FOUND");
  });
});

describe("config", () => {
  it("requires a 32+ char JWT secret and parses CORS origins", () => {
    expect(() => loadConfig({ BRIDGE_JWT_SECRET: "short" })).toThrow();
    const c = loadConfig({ BRIDGE_JWT_SECRET: SECRET, BRIDGE_CORS_ORIGINS: "http://a.test, http://b.test" });
    expect(c.corsOrigins).toEqual(["http://a.test", "http://b.test"]);
    expect(c.port).toBe(4000);
    expect(c.supabase).toBeUndefined();
    expect(loadConfig({ BRIDGE_JWT_SECRET: SECRET }).corsOrigins).toEqual(["http://localhost:3000", "http://localhost:3100"]);
  });
});
