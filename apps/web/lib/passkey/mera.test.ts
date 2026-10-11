import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebAuthnClient } from "@category-labs/mera";
import { MEMORY_PRF_SALT } from "./keys";
import { PasskeyError } from "./types";

// Mera is replaced by a stand-in that drives the WebAuthn client the way Mera does: it passes its own salt and
// returns the first output. What the service does with the second salt is what these tests are about.
const DEFAULT_SALT = new Uint8Array(32).fill(1);
const calls: { fn: string; prfSalt?: Uint8Array }[] = [];

vi.mock("@category-labs/mera", () => {
  const run = async (fn: string, o: { prfSalt?: Uint8Array; webAuthnClient: WebAuthnClient }) => {
    calls.push({ fn, prfSalt: o.prfSalt });
    const r = await o.webAuthnClient.getCredential({ rpId: "localhost", challenge: new Uint8Array(32), prfSalt: o.prfSalt ?? DEFAULT_SALT, userVerification: "required" } as never);
    return { credentialId: "cred-1", prfOutput: r.prfOutput };
  };
  return {
    createPasskeyWithPrfOutput: (o: never) => run("create", o),
    getPasskeyPrfOutput: (o: never) => run("get", o),
    isMeraError: () => false,
    // keys.ts imports these at module load; they are not called here.
    createSecp256k1SigningSession: () => ({}),
    getEvmAddress: () => "0x",
  };
});
vi.mock("@category-labs/mera/viem", () => ({ toViemAccount: () => ({}) }));

const out = (fill: number) => new Uint8Array(32).fill(fill).buffer;
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const isMemorySalt = (salt: Uint8Array) => hex(salt) === hex(MEMORY_PRF_SALT);

/** An authenticator: `answers(evalRequest)` decides which PRF results come back. */
function authenticator(answers: (e: { first: Uint8Array; second?: Uint8Array }) => { first?: ArrayBuffer; second?: ArrayBuffer }) {
  const prompts: { first: Uint8Array; second?: Uint8Array }[] = [];
  const get = async (o: { publicKey: { extensions: { prf: { eval: { first: Uint8Array; second?: Uint8Array } } } } }) => {
    const e = o.publicKey.extensions.prf.eval;
    prompts.push(e);
    return { rawId: new Uint8Array([1]).buffer, response: {}, getClientExtensionResults: () => ({ prf: { results: answers(e) } }) };
  };
  vi.stubGlobal("navigator", { credentials: { get, create: get } });
  vi.stubGlobal("window", { location: { hostname: "localhost" } });
  return prompts;
}

const service = async () => (await import("./mera")).createMeraPasskeyService();

beforeEach(() => {
  calls.length = 0;
});
afterEach(() => vi.unstubAllGlobals());

describe("createMeraPasskeyService", () => {
  it("gets both namespaces from one prompt when the authenticator answers two salts", async () => {
    const prompts = authenticator(() => ({ first: out(0xa1), second: out(0xb2) }));
    const secret = await (await service()).signIn();
    expect(prompts).toHaveLength(1);
    expect(hex(prompts[0]!.second!)).toBe(hex(MEMORY_PRF_SALT));
    expect(calls).toEqual([{ fn: "get", prfSalt: undefined }]);
    expect(secret.prfOutput).toEqual(new Uint8Array(32).fill(0xa1));
    expect(secret.memoryPrfOutput).toEqual(new Uint8Array(32).fill(0xb2));
  });

  it("does the same when creating a passkey", async () => {
    const prompts = authenticator(() => ({ first: out(0xa1), second: out(0xb2) }));
    const secret = await (await service()).create();
    expect(prompts).toHaveLength(1);
    expect(calls).toEqual([{ fn: "create", prfSalt: undefined }]);
    expect(secret.memoryPrfOutput).toEqual(new Uint8Array(32).fill(0xb2));
  });

  it("asks Mera a second time with the memory salt when the authenticator answers one salt per prompt", async () => {
    const prompts = authenticator((e) => ({ first: out(isMemorySalt(e.first) ? 0xb2 : 0xa1) }));
    const secret = await (await service()).signIn({ credentialId: "cred-1" });
    expect(prompts).toHaveLength(2);
    expect(calls).toHaveLength(2);
    expect(hex(calls[1]!.prfSalt!)).toBe(hex(MEMORY_PRF_SALT));
    expect(secret.prfOutput).toEqual(new Uint8Array(32).fill(0xa1));
    expect(secret.memoryPrfOutput).toEqual(new Uint8Array(32).fill(0xb2));
  });

  it("refuses an authenticator that returns the same output for both salts", async () => {
    authenticator(() => ({ first: out(0xa1), second: out(0xa1) }));
    const err = await (await service()).signIn().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PasskeyError);
    expect((err as PasskeyError).code).toBe("PRF_UNAVAILABLE");
  });
});
