import { authMessage, zAuthChallengeResponse, zAuthVerifyResponse, zErrorEnvelope, zVaultResponse } from "@hive/shared";
import request from "supertest";
import { verifyMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { ChallengeStore } from "../src/auth.js";
import { SessionStore } from "../src/sessions.js";
import { InMemoryChain, InMemoryCiphertextStore, InMemoryVaultStore } from "../src/stubs.js";
import { TokenService } from "../src/tokens.js";
import type { VaultStore } from "../src/types.js";

const SECRET = "s".repeat(40);
const alice = privateKeyToAccount(("0x" + "ab".repeat(32)) as `0x${string}`);
const bob = privateKeyToAccount(("0x" + "cd".repeat(32)) as `0x${string}`);
const CRED = "cred_ABC-123";
const VAULT = { version: 1, ciphertext: "c2VhbGVk", salt: "c2FsdA" };

let clock = 1_700_000_000;
const now = () => clock;
let app: ReturnType<typeof createApp>;

function build(vaults: VaultStore = new InMemoryVaultStore()) {
  return createApp({
    corsOrigins: [],
    tokens: new TokenService(SECRET, now),
    challenges: new ChallengeStore(now),
    verifySignature: ({ owner, message, signature }) => verifyMessage({ address: owner as `0x${string}`, message, signature }),
    probes: { rpc: async () => true, supabase: async () => true },
    sessions: new SessionStore(now),
    chain: new InMemoryChain(),
    store: new InMemoryCiphertextStore(),
    vaults,
    writer: { write: async () => { throw new Error("not used here"); } },
  });
}

async function token(who = alice) {
  const c = zAuthChallengeResponse.parse((await request(app).post("/v1/auth/challenge").send({ owner: who.address })).body);
  const signature = await who.signMessage({ message: authMessage(who.address, c.nonce) });
  return `Bearer ${zAuthVerifyResponse.parse((await request(app).post("/v1/auth/verify").send({ owner: who.address, nonce: c.nonce, signature })).body).userToken}`;
}

const put = (auth: string | undefined, body: unknown = { vault: VAULT }, id = CRED) => {
  const r = request(app).put(`/v1/vaults/${id}`);
  return (auth ? r.set("Authorization", auth) : r).send(body as object);
};

beforeEach(() => {
  clock = 1_700_000_000;
  app = build();
});

describe("/v1/vaults/:credentialId", () => {
  it("GET is 404 until a vault is stored", async () => {
    const res = await request(app).get(`/v1/vaults/${CRED}`);
    expect(res.status).toBe(404);
    expect(zErrorEnvelope.parse(res.body).error.code).toBe("NOT_FOUND");
  });

  it("PUT needs a user token", async () => {
    expect((await put(undefined)).status).toBe(401);
  });

  it("stores a vault and serves it without a token, with no owner in the body", async () => {
    expect((await put(await token())).status).toBe(201);
    const res = await request(app).get(`/v1/vaults/${CRED}`);
    expect(res.status).toBe(200);
    expect(zVaultResponse.parse(res.body).vault).toEqual(VAULT);
    expect(JSON.stringify(res.body).toLowerCase()).not.toContain(alice.address.toLowerCase());
  });

  it("lets the first owner replace it and refuses another owner", async () => {
    expect((await put(await token())).status).toBe(201);
    expect((await put(await token(), { vault: { ...VAULT, salt: "bmV3" } })).status).toBe(204);
    const res = await put(await token(bob), { vault: { evil: true } });
    expect(res.status).toBe(403);
    expect(zErrorEnvelope.parse(res.body).error.code).toBe("FORBIDDEN");
    expect((await request(app).get(`/v1/vaults/${CRED}`)).body.vault).toEqual({ ...VAULT, salt: "bmV3" });
  });

  it("rejects a malformed credential id and a malformed body", async () => {
    const auth = await token();
    expect((await put(auth, { vault: VAULT }, "bad!id")).status).toBe(400);
    expect((await put(auth, { vault: "text" })).status).toBe(400);
    expect((await put(auth, {})).status).toBe(400);
    expect((await request(app).get("/v1/vaults/bad!id")).status).toBe(400);
  });

  it("maps a store failure to STORAGE_ERROR without leaking its message", async () => {
    app = build({ get: async () => { throw new Error("db password leaked"); }, put: async () => { throw new Error("db password leaked"); } });
    const get = await request(app).get(`/v1/vaults/${CRED}`);
    expect(get.status).toBe(502);
    const res = await put(await token());
    expect(res.status).toBe(502);
    expect(JSON.stringify([get.body, res.body])).not.toContain("password");
  });
});
