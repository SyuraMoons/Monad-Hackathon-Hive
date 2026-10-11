import { decrypt, encrypt } from "@hive/crypto";
import { authMessage, zAuthChallengeResponse, zAuthVerifyResponse, zErrorEnvelope, zMemoryResponse, type Hex } from "@hive/shared";
import request from "supertest";
import { verifyMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { ChallengeStore } from "../src/auth.js";
import { SessionStore } from "../src/sessions.js";
import { InMemoryChain, InMemoryCiphertextStore, InMemoryVaultStore } from "../src/stubs.js";
import { TokenService } from "../src/tokens.js";
import type { CiphertextStore } from "../src/types.js";

const SECRET = "s".repeat(40);
const KEY = ("0x" + "77".repeat(32)) as Hex;
const KEY_ID = "hive-key:0xabc";
const alice = privateKeyToAccount(("0x" + "ab".repeat(32)) as Hex);
const bob = privateKeyToAccount(("0x" + "cd".repeat(32)) as Hex);

let clock = 1_700_000_000;
const now = () => clock;
let store: InMemoryCiphertextStore;
let tokens: TokenService;
let app: ReturnType<typeof createApp>;

function build(memory: CiphertextStore) {
  return createApp({
    corsOrigins: [],
    tokens,
    challenges: new ChallengeStore(now),
    verifySignature: ({ owner, message, signature }) => verifyMessage({ address: owner as Hex, message, signature }),
    probes: { rpc: async () => true, supabase: async () => true },
    sessions: new SessionStore(now),
    chain: new InMemoryChain(),
    store: memory,
    vaults: new InMemoryVaultStore(),
    writer: { write: async () => { throw new Error("not used here"); } },
  });
}

async function userToken(who = alice) {
  const c = zAuthChallengeResponse.parse((await request(app).post("/v1/auth/challenge").send({ owner: who.address })).body);
  const signature = await who.signMessage({ message: authMessage(who.address, c.nonce) });
  return `Bearer ${zAuthVerifyResponse.parse((await request(app).post("/v1/auth/verify").send({ owner: who.address, nonce: c.nonce, signature })).body).userToken}`;
}

async function seal(plaintext: string, owner: Hex) {
  const sealed = await encrypt(plaintext, KEY);
  await store.put(sealed.contentHash, { ciphertext: sealed.ciphertext, iv: sealed.iv, owner, keyId: KEY_ID });
  return sealed;
}

const get = (hash: string, auth?: string) => {
  const r = request(app).get(`/v1/memory/${hash}`);
  return auth ? r.set("Authorization", auth) : r;
};

beforeEach(() => {
  clock = 1_700_000_000;
  store = new InMemoryCiphertextStore();
  tokens = new TokenService(SECRET, now);
  app = build(store);
});

describe("GET /v1/memory/:contentHash", () => {
  it("gives the owner their ciphertext, which decrypts on their side", async () => {
    const sealed = await seal("the staging db is read-only", alice.address);
    const res = await get(sealed.contentHash, await userToken());
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    const body = zMemoryResponse.parse(res.body);
    expect(body.keyId).toBe(KEY_ID);
    const back = { ciphertext: new Uint8Array(Buffer.from(body.ciphertext, "base64")), iv: new Uint8Array(Buffer.from(body.iv, "base64")) };
    expect(await decrypt(back, KEY)).toBe("the staging db is read-only");
    expect(JSON.stringify(res.body)).not.toContain("staging");
  });

  it("matches the owner whatever the case of the stored address or the hash", async () => {
    const sealed = await seal("mixed case", alice.address.toUpperCase().replace("0X", "0x") as Hex);
    const res = await get(sealed.contentHash.toUpperCase().replace("0X", "0x"), await userToken());
    expect(res.status).toBe(200);
  });

  it("answers another owner exactly as it answers a hash that does not exist", async () => {
    const sealed = await seal("alice only", alice.address);
    const theirs = await get(sealed.contentHash, await userToken(bob));
    const missing = await get("0x" + "ee".repeat(32), await userToken(bob));
    expect(theirs.status).toBe(404);
    expect(theirs.body).toEqual(missing.body);
    expect(zErrorEnvelope.parse(theirs.body).error.code).toBe("NOT_FOUND");
  });

  it("needs a user token", async () => {
    const sealed = await seal("no token", alice.address);
    expect((await get(sealed.contentHash)).status).toBe(401);
  });

  it("refuses an agent token", async () => {
    const sealed = await seal("agent token", alice.address);
    const { token } = await tokens.signAgent(BigInt(1), alice.address);
    expect((await get(sealed.contentHash, `Bearer ${token}`)).status).toBe(401);
  });

  it("rejects a hash that is not 32-byte hex", async () => {
    const auth = await userToken();
    for (const bad of ["abc", "0x1234", "0x" + "zz".repeat(32)]) {
      const res = await get(bad, auth);
      expect(res.status).toBe(400);
      expect(zErrorEnvelope.parse(res.body).error.code).toBe("INVALID_INPUT");
    }
  });

  it("is a 502 with a fixed message when the store fails", async () => {
    const failing: CiphertextStore = {
      get: async () => undefined,
      getOwned: async () => { throw new Error("supabase: password=hunter2"); },
      getMany: async () => new Map(),
      put: async () => undefined,
    };
    app = build(failing);
    const res = await get("0x" + "aa".repeat(32), await userToken());
    expect(res.status).toBe(502);
    const { error } = zErrorEnvelope.parse(res.body);
    expect(error.code).toBe("STORAGE_ERROR");
    expect(error.message).not.toContain("hunter2");
  });
});
