import { encrypt, keyIdOf } from "@hive/crypto";
import { HiveError, MEMORY_ENVELOPE_PREFIX, sealDoc, type ContentHash, type MemoryResponse } from "@hive/shared";
import { describe, expect, it } from "vitest";
import { LockedError } from "../memoryView";
import { previewMemory } from "./preview";

const KEY = new Uint8Array(32).fill(0x11);
const OTHER = new Uint8Array(32).fill(0x22);
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

/** What the bridge's GET /v1/memory/:hash would answer for text sealed with `key`. */
async function sealed(plaintext: string, key = KEY) {
  const s = await encrypt(plaintext, key);
  const res: MemoryResponse = { ciphertext: b64(s.ciphertext), iv: b64(s.iv), keyId: keyIdOf(key) };
  return { hash: s.contentHash, res };
}

const deps = (res: MemoryResponse | Error, key: Uint8Array | null = KEY) => ({
  fetchSealed: async () => {
    if (res instanceof Error) throw res;
    return res;
  },
  encryptionKey: () => key ?? undefined,
});

describe("previewMemory", () => {
  it("reads legacy text with no envelope", async () => {
    const { hash, res } = await sealed("the staging db is read-only");
    expect(await previewMemory(deps(res), hash)).toEqual({ content: "the staging db is read-only" });
  });

  it("opens the hive-memory/v1 envelope into content, gist and kind", async () => {
    const text = sealDoc({ content: "We chose Supabase over Firebase.\nRLS is on.", gist: "Chose Supabase", kind: "decision" });
    expect(text.startsWith(MEMORY_ENVELOPE_PREFIX)).toBe(true);
    const { hash, res } = await sealed(text);
    expect(await previewMemory(deps(res), hash)).toEqual({ content: "We chose Supabase over Firebase.\nRLS is on.", gist: "Chose Supabase", kind: "decision" });
  });

  it("is locked without a key, and after the key is zeroed on sign-out", async () => {
    const { hash, res } = await sealed("x");
    await expect(previewMemory(deps(res, null), hash)).rejects.toBeInstanceOf(LockedError);
    await expect(previewMemory(deps(res, new Uint8Array(32)), hash)).rejects.toBeInstanceOf(LockedError);
  });

  it("does not ask the bridge while locked", async () => {
    let asked = false;
    const d = { fetchSealed: async () => { asked = true; throw new Error("no"); }, encryptionKey: () => undefined };
    await expect(previewMemory(d, ("0x" + "aa".repeat(32)) as ContentHash)).rejects.toBeInstanceOf(LockedError);
    expect(asked).toBe(false);
  });

  it("refuses a memory sealed with another key, before decrypting", async () => {
    const { hash, res } = await sealed("someone else's key", OTHER);
    const err = await previewMemory(deps(res), hash).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HiveError);
    expect((err as HiveError).code).toBe("FORBIDDEN");
  });

  it("refuses ciphertext that is not the memory that was asked for", async () => {
    const a = await sealed("first");
    const b = await sealed("second");
    const err = await previewMemory(deps(b.res), a.hash).catch((e: unknown) => e);
    expect((err as HiveError).code).toBe("INTERNAL");
  });

  it("fails with a fixed message on tampered ciphertext, never with content", async () => {
    const s = await encrypt("secret plan", KEY);
    const bad = new Uint8Array(s.ciphertext);
    bad[0] ^= 1;
    // The hash of the tampered bytes is what a lying bridge's row would claim.
    const res: MemoryResponse = { ciphertext: b64(bad), iv: b64(s.iv), keyId: keyIdOf(KEY) };
    const err = await previewMemory(deps(res), s.contentHash).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HiveError);
    expect((err as HiveError).message).not.toContain("secret");
  });

  it("passes a bridge error through unchanged", async () => {
    const notFound = new HiveError("NOT_FOUND", "No such memory.");
    const err = await previewMemory(deps(notFound), ("0x" + "aa".repeat(32)) as ContentHash).catch((e: unknown) => e);
    expect(err).toBe(notFound);
  });
});
