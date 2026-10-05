import { authMessage, zAgentsResponse, zAuthChallengeResponse, zAuthorizeResponse, zErrorEnvelope, type Hex } from "@hive/shared";
import request from "supertest";
import { verifyMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { ChallengeStore } from "../src/auth.js";
import type { GasFunder } from "../src/funder.js";
import { SessionStore } from "../src/sessions.js";
import { InMemoryChain, InMemoryCiphertextStore } from "../src/stubs.js";
import { TokenService } from "../src/tokens.js";

const SECRET = "s".repeat(40);
const owner = privateKeyToAccount(("0x" + "ab".repeat(32)) as Hex);
const stranger = privateKeyToAccount(("0x" + "cd".repeat(32)) as Hex);
const AGENT_KEY = ("0x" + "11".repeat(32)) as Hex;
const OTHER_KEY = ("0x" + "22".repeat(32)) as Hex;
const ENC_KEY = ("0x" + "33".repeat(32)) as Hex;
const agentAddress = privateKeyToAccount(AGENT_KEY).address;
const ZERO = "0x0000000000000000000000000000000000000000" as Hex;

let clock = 1_700_000_000;
const now = () => clock;

class SpyFunder implements GasFunder {
  calls: Array<{ owner: string; agent: string }> = [];
  fail = false;
  async ensureFunded(o: string, agent: Hex) {
    this.calls.push({ owner: o, agent });
    if (this.fail) throw new Error("funder down");
    return "funded" as const;
  }
}

let chain: InMemoryChain;
let sessions: SessionStore;
let funder: SpyFunder;
let app: ReturnType<typeof createApp>;

function seedAgent(id: bigint, o: Hex, writer: Hex, name = "Claude", agentType = "claude") {
  chain.agents.set(id, { id, name, owner: o, agentType, writer });
}

async function signIn(who = owner) {
  const c = zAuthChallengeResponse.parse((await request(app).post("/v1/auth/challenge").send({ owner: who.address })).body);
  const signature = await who.signMessage({ message: authMessage(who.address, c.nonce) });
  const res = await request(app).post("/v1/auth/verify").send({ owner: who.address, nonce: c.nonce, signature });
  return `Bearer ${res.body.userToken}`;
}

const authorize = (id: string | number, auth: string | undefined, body: unknown = { agentPrivateKey: AGENT_KEY, encryptionKey: ENC_KEY }) => {
  const r = request(app).post(`/v1/agents/${id}/authorize`).send(body as object);
  return auth ? r.set("Authorization", auth) : r;
};

beforeEach(() => {
  clock = 1_700_000_000;
  chain = new InMemoryChain();
  sessions = new SessionStore(now);
  funder = new SpyFunder();
  app = createApp({
    corsOrigins: [],
    tokens: new TokenService(SECRET, now),
    challenges: new ChallengeStore(now),
    verifySignature: ({ owner: o, message, signature }) => verifyMessage({ address: o as Hex, message, signature }),
    probes: { rpc: async () => true, supabase: async () => false },
    sessions,
    chain,
    store: new InMemoryCiphertextStore(),
    writer: { write: async () => { throw new Error("not used here"); } },
    funder,
    publicUrl: "https://bridge.example",
    now: () => BigInt(clock),
  });
});

describe("POST /v1/agents/:id/authorize", () => {
  it("rejects a request without a user token", async () => {
    seedAgent(1n, owner.address, agentAddress);
    expect((await authorize(1, undefined)).status).toBe(401);
  });

  it("rejects a malformed body and a malformed id", async () => {
    const auth = await signIn();
    expect((await authorize(1, auth, { agentPrivateKey: "0x1234", encryptionKey: ENC_KEY })).status).toBe(400);
    expect((await authorize("abc", auth)).status).toBe(400);
  });

  it("404 for an agent that is not registered", async () => {
    const res = await authorize(9, await signIn());
    expect(res.status).toBe(404);
    expect(zErrorEnvelope.parse(res.body).error.code).toBe("NOT_FOUND");
  });

  it("403 when the agent belongs to another owner, and stores nothing", async () => {
    seedAgent(1n, stranger.address, agentAddress);
    const res = await authorize(1, await signIn());
    expect(res.status).toBe(403);
    expect(sessions.get(1n)).toBeUndefined();
    expect(funder.calls).toEqual([]);
  });

  it("403 when the key is not the agent's registered writer", async () => {
    seedAgent(1n, owner.address, agentAddress);
    const res = await authorize(1, await signIn(), { agentPrivateKey: OTHER_KEY, encryptionKey: ENC_KEY });
    expect(res.status).toBe(403);
    expect(sessions.get(1n)).toBeUndefined();
    expect(funder.calls).toEqual([]);
  });

  it("403 with a clear message when no writer is registered yet", async () => {
    seedAgent(1n, owner.address, ZERO);
    const res = await authorize(1, await signIn());
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/writer/i);
  });

  it("returns an agent token and keeps both keys in memory only", async () => {
    seedAgent(1n, owner.address, agentAddress);
    const res = await authorize(1, await signIn());
    expect(res.status).toBe(200);
    const body = zAuthorizeResponse.parse(res.body);
    expect(body.mcpUrl).toBe("https://bridge.example/mcp");
    const claims = await new TokenService(SECRET, now).verifyAgent(body.agentToken);
    expect(claims.agentId).toBe(1n);
    expect(claims.owner.toLowerCase()).toBe(owner.address.toLowerCase());
    expect(body.expiresAt).toBe(claims.expiresAt);
    expect(sessions.get(1n)).toMatchObject({ agentPrivateKey: AGENT_KEY, encryptionKey: ENC_KEY, name: "Claude", expiresAt: body.expiresAt });
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain(AGENT_KEY.slice(2));
    expect(raw).not.toContain(ENC_KEY.slice(2));
  });

  it("tops up the agent key's gas, and a funder failure does not block authorize", async () => {
    seedAgent(1n, owner.address, agentAddress);
    const auth = await signIn();
    expect((await authorize(1, auth)).status).toBe(200);
    expect(funder.calls).toEqual([{ owner: owner.address, agent: agentAddress }]);
    funder.fail = true;
    expect((await authorize(1, auth)).status).toBe(200);
  });

  it("authorizing again replaces the session keys", async () => {
    seedAgent(1n, owner.address, agentAddress);
    const auth = await signIn();
    await authorize(1, auth);
    const newEnc = ("0x" + "44".repeat(32)) as Hex;
    await authorize(1, auth, { agentPrivateKey: AGENT_KEY, encryptionKey: newEnc });
    expect(sessions.get(1n)?.encryptionKey).toBe(newEnc);
  });

  it("502 CHAIN_ERROR when the registry cannot be read", async () => {
    chain.agent = async () => { throw new Error("rpc down"); };
    const res = await authorize(1, await signIn());
    expect(res.status).toBe(502);
    expect(zErrorEnvelope.parse(res.body).error.code).toBe("CHAIN_ERROR");
    expect(sessions.get(1n)).toBeUndefined();
  });
});

describe("GET /v1/agents", () => {
  it("lists only the caller's agents with their session status", async () => {
    seedAgent(1n, owner.address, agentAddress, "Claude", "claude");
    seedAgent(2n, owner.address, ZERO, "Weird", "not-a-known-type");
    seedAgent(3n, stranger.address, ZERO, "Theirs", "gpt");
    const auth = await signIn();
    await authorize(1, auth);
    sessions.touch(1n);
    const res = await request(app).get("/v1/agents").set("Authorization", auth);
    expect(res.status).toBe(200);
    const list = zAgentsResponse.parse(res.body);
    expect(list.map((a) => a.name)).toEqual(["Claude", "Weird"]);
    expect(list[0]).toMatchObject({ agentId: 1n, agentType: "claude", connected: true, lastCallAt: clock, tokenExpiresAt: clock + 86400 });
    expect(list[1]).toMatchObject({ agentType: "other", connected: false, lastCallAt: null, tokenExpiresAt: null });
  });

  it("401 without a token, 502 when the registry cannot be read", async () => {
    expect((await request(app).get("/v1/agents")).status).toBe(401);
    const auth = await signIn();
    chain.agentsOf = async () => { throw new Error("rpc down"); };
    const res = await request(app).get("/v1/agents").set("Authorization", auth);
    expect(res.status).toBe(502);
  });
});
