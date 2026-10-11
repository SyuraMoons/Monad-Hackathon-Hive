import { contentHash as hashOf, decrypt, keyIdOf } from "@hive/crypto";
import { HiveError, openDoc, type ContentHash, type MemoryResponse } from "@hive/shared";
import { LockedError, type MemoryView } from "../memoryView";

// The owner reads their own memory: the bridge hands over ciphertext, this decrypts it with the key the passkey derived.
// Plaintext only ever lives in the returned value. Errors carry fixed messages, never content.

export type PreviewDeps = {
  /** GET /v1/memory/:contentHash. */
  fetchSealed(contentHash: ContentHash): Promise<MemoryResponse>;
  /** The owner's encryption keys, the current one first (ADR-029). Empty while the keys are locked. */
  encryptionKeys(): Uint8Array[];
};

const fromBase64 = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

export async function previewMemory(deps: PreviewDeps, contentHash: ContentHash): Promise<MemoryView> {
  // Keys.end() zeroes the arrays in place, so all zeros means signed out.
  const keys = deps.encryptionKeys().filter((k) => !k.every((b) => b === 0));
  if (keys.length === 0) throw new LockedError();

  const sealed = await deps.fetchSealed(contentHash);
  // The row says which key sealed it: the current one, or the one from before ADR-029.
  const key = keys.find((k) => keyIdOf(k) === sealed.keyId);
  if (!key) throw new HiveError("FORBIDDEN", "This memory was sealed with a different key.");

  let plaintext: string;
  try {
    const iv = fromBase64(sealed.iv);
    const ciphertext = fromBase64(sealed.ciphertext);
    // The hash is what the chain recorded: a bridge that sent some other memory would fail here.
    if (hashOf(iv, ciphertext) !== contentHash.toLowerCase()) throw new Error("hash mismatch");
    plaintext = await decrypt({ ciphertext, iv }, key);
  } catch {
    throw new HiveError("INTERNAL", "Could not decrypt this memory.");
  }

  const { content, gist, kind } = openDoc(plaintext);
  return { content, ...(gist !== undefined && { gist }), ...(kind !== undefined && { kind }) };
}
