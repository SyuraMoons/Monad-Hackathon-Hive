import { createDecipheriv, createCipheriv, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { keccak256, concatBytes } from "viem";
import { contentHash, CryptoError, decrypt, decryptBytes, encrypt, encryptBytes, fromBase64, toBase64 } from "../src/index.js";

const KEY = ("0x" + "11".repeat(32)) as `0x${string}`;
const OTHER_KEY = ("0x" + "22".repeat(32)) as `0x${string}`;

describe("encrypt / decrypt", () => {
  it("round-trips, including unicode", async () => {
    for (const text of ["Nexus, deadline 13 Okt", "kerjaan 🚀 – ünïcode", "x"]) {
      expect(await decrypt(await encrypt(text, KEY), KEY)).toBe(text);
    }
  });

  it("uses a fresh IV, so the same text encrypts differently", async () => {
    const a = await encrypt("same", KEY);
    const b = await encrypt("same", KEY);
    expect(a.iv).not.toEqual(b.iv);
    expect(a.ciphertext).not.toEqual(b.ciphertext);
  });

  it("appends the 16-byte tag and uses a 12-byte IV", async () => {
    const s = await encrypt("hello", KEY);
    expect(s.iv.length).toBe(12);
    expect(s.ciphertext.length).toBe(5 + 16);
  });

  it("is interoperable with node:crypto AES-256-GCM (same layout as WebCrypto in the browser)", async () => {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", Buffer.from(KEY.slice(2), "hex"), iv);
    const body = Buffer.concat([c.update("from node", "utf8"), c.final()]);
    const ciphertext = new Uint8Array(Buffer.concat([body, c.getAuthTag()]));
    expect(await decrypt({ ciphertext, iv: new Uint8Array(iv) }, KEY)).toBe("from node");

    const s = await encrypt("to node", KEY);
    const d = createDecipheriv("aes-256-gcm", Buffer.from(KEY.slice(2), "hex"), s.iv);
    d.setAuthTag(Buffer.from(s.ciphertext.slice(-16)));
    expect(Buffer.concat([d.update(s.ciphertext.slice(0, -16)), d.final()]).toString("utf8")).toBe("to node");
  });

  it("rejects the wrong key, a tampered ciphertext and a tampered IV", async () => {
    const s = await encrypt("secret", KEY);
    await expect(decrypt(s, OTHER_KEY)).rejects.toBeInstanceOf(CryptoError);
    const flipped = new Uint8Array(s.ciphertext);
    flipped[0] ^= 1;
    await expect(decrypt({ ciphertext: flipped, iv: s.iv }, KEY)).rejects.toBeInstanceOf(CryptoError);
    const iv = new Uint8Array(s.iv);
    iv[0] ^= 1;
    await expect(decrypt({ ciphertext: s.ciphertext, iv }, KEY)).rejects.toBeInstanceOf(CryptoError);
  });

  it("rejects malformed keys and inputs without echoing content", async () => {
    await expect(encrypt("x", "0x1234")).rejects.toThrow(/32 bytes/);
    await expect(decrypt({ ciphertext: new Uint8Array(4), iv: new Uint8Array(12) }, KEY)).rejects.toThrow(/too short/);
    await expect(decrypt({ ciphertext: new Uint8Array(20), iv: new Uint8Array(8) }, KEY)).rejects.toThrow(/iv must be/);
    const err = await decrypt(await encrypt("top secret", KEY), OTHER_KEY).catch((e: Error) => e);
    expect((err as Error).message).not.toContain("top secret");
  });
});

describe("contentHash", () => {
  it("is keccak256(iv ‖ ciphertext) and independent of the key", async () => {
    const s = await encrypt("hash me", KEY);
    expect(s.contentHash).toBe(keccak256(concatBytes([s.iv, s.ciphertext])));
    expect(contentHash(s.iv, s.ciphertext)).toBe(s.contentHash);
  });

  it("changes when the ciphertext changes", async () => {
    const s = await encrypt("a", KEY);
    const other = new Uint8Array(s.ciphertext);
    other[0] ^= 1;
    expect(contentHash(s.iv, other)).not.toBe(s.contentHash);
  });
});

describe("base64", () => {
  it("round-trips bytes", () => {
    const bytes = randomBytes(40);
    expect(Buffer.from(fromBase64(toBase64(bytes)))).toEqual(bytes);
  });
});

describe("encryptBytes / decryptBytes", () => {
  it("round-trips binary data and shares the text layout", async () => {
    const data = new Uint8Array(Array.from({ length: 384 * 4 }, (_, i) => i % 251));
    const sealed = await encryptBytes(data, KEY);
    expect(sealed.iv.length).toBe(12);
    expect(sealed.ciphertext.length).toBe(data.length + 16);
    expect(await decryptBytes(sealed, KEY)).toEqual(data);
    expect(sealed.contentHash).toBe(contentHash(sealed.iv, sealed.ciphertext));
    await expect(decryptBytes(sealed, OTHER_KEY)).rejects.toBeInstanceOf(CryptoError);
  });
});
