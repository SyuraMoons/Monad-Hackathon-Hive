import { describe, expect, it } from "vitest";
import { deriveKeysFromPhrase, MEMORY_PRF_SALT, recoveryPhraseFromPrf } from "./keys";

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const ACCOUNT = new Uint8Array(32).fill(7);
const MEMORY = new Uint8Array(32).fill(9);

describe("key derivation (ADR-005, ADR-029)", () => {
  it("keeps the account and the legacy key exactly where they were before the memory salt", async () => {
    // Recorded from the code before ADR-029. A change here moves every owner address or makes old ciphertext unreadable.
    const keys = await deriveKeysFromPhrase(recoveryPhraseFromPrf(ACCOUNT), MEMORY);
    expect(keys.ownerAddress).toBe("0x29458C602E3DB4fC3b54EC2bbEE26Dbe64C7779f");
    expect(hex(keys.legacyEncryptionKey)).toBe("9ee1b8698bc07d7e3e572aeed0158aa9e79f133faaf5bd2e035da5e574726ef9");
    keys.end();
  });

  it("takes the memory key from the memory PRF output only", async () => {
    const phrase = recoveryPhraseFromPrf(ACCOUNT);
    const a = await deriveKeysFromPhrase(phrase, MEMORY);
    const sameMemoryOtherAccount = await deriveKeysFromPhrase(recoveryPhraseFromPrf(new Uint8Array(32).fill(8)), MEMORY);
    const otherMemorySameAccount = await deriveKeysFromPhrase(phrase, new Uint8Array(32).fill(10));

    expect(hex(a.encryptionKey)).toBe(hex(sameMemoryOtherAccount.encryptionKey));
    expect(a.ownerAddress).not.toBe(sameMemoryOtherAccount.ownerAddress);

    expect(hex(a.encryptionKey)).not.toBe(hex(otherMemorySameAccount.encryptionKey));
    expect(a.ownerAddress).toBe(otherMemorySameAccount.ownerAddress);
    expect(hex(a.legacyEncryptionKey)).toBe(hex(otherMemorySameAccount.legacyEncryptionKey));
  });

  it("gives a memory key that is neither the PRF output nor the legacy key, and is stable", async () => {
    const phrase = recoveryPhraseFromPrf(ACCOUNT);
    const a = await deriveKeysFromPhrase(phrase, MEMORY);
    const b = await deriveKeysFromPhrase(phrase, MEMORY);
    expect(a.encryptionKey).toHaveLength(32);
    expect(hex(a.encryptionKey)).toBe(hex(b.encryptionKey));
    expect(hex(a.encryptionKey)).not.toBe(hex(MEMORY));
    expect(hex(a.encryptionKey)).not.toBe(hex(a.legacyEncryptionKey));
  });

  it("refuses a memory PRF output that is not 32 bytes", async () => {
    await expect(deriveKeysFromPhrase(recoveryPhraseFromPrf(ACCOUNT), new Uint8Array(16))).rejects.toThrow("32 bytes");
  });

  it("zeroes both encryption keys on end()", async () => {
    const keys = await deriveKeysFromPhrase(recoveryPhraseFromPrf(ACCOUNT), MEMORY);
    keys.end();
    expect(keys.encryptionKey.every((b) => b === 0)).toBe(true);
    expect(keys.legacyEncryptionKey.every((b) => b === 0)).toBe(true);
  });

  it("uses a fixed 32-byte memory salt", () => {
    // sha256("hive/prf/memory/v1"). Never change it: the memory key of every account depends on it.
    expect(hex(MEMORY_PRF_SALT)).toBe("ae77a6e6cf602470cf8af9a31c7aba0ec9ca5c3e02bc19ea4cfd2a0a8c2d3fba");
  });
});
