import { zContentHash, type ContentHash, type Hex } from "@hive/shared";
import { bytesToHex, concatBytes, hexToBytes, keccak256, stringToBytes } from "viem";

// AES-256-GCM, the same layout WebCrypto produces in the browser: 12-byte random IV,
// ciphertext with the 16-byte tag appended. The key is the delegated `encryptionKey` (32 bytes).
// Plaintext only ever lives in the caller's memory: nothing here logs or returns it except `decrypt`.

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export type Sealed = {
  /** Ciphertext followed by the 16-byte GCM tag. */
  ciphertext: Uint8Array;
  iv: Uint8Array;
  contentHash: ContentHash;
};

export class CryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CryptoError";
  }
}

async function importKey(key: Hex | Uint8Array): Promise<CryptoKey> {
  const raw = typeof key === "string" ? hexToBytes(key) : key;
  if (raw.length !== KEY_BYTES) throw new CryptoError(`encryption key must be ${KEY_BYTES} bytes`);
  return crypto.subtle.importKey("raw", new Uint8Array(raw), "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** Which key sealed a row, without revealing it: a short domain-separated hash. The bridge stores it and the web checks it before decrypting. */
export const keyIdOf = (key: Hex | Uint8Array) => `hive-key:${keccak256(concatBytes([stringToBytes("hive/key-id"), typeof key === "string" ? hexToBytes(key) : key])).slice(0, 18)}`;

/** keccak256(iv ‖ ciphertext). Never a hash of plaintext, so the hash leaks nothing about the content. */
export function contentHash(iv: Uint8Array, ciphertext: Uint8Array): ContentHash {
  return zContentHash.parse(keccak256(concatBytes([iv, ciphertext])));
}

async function seal(data: Uint8Array, key: Hex | Uint8Array): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const out = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await importKey(key), new Uint8Array(data)));
  return { ciphertext: out, iv, contentHash: contentHash(iv, out) };
}

export const encrypt = (plaintext: string, key: Hex | Uint8Array): Promise<Sealed> => seal(new TextEncoder().encode(plaintext), key);

/** Same layout for binary data, such as an embedding vector (ADR-022). */
export const encryptBytes = (data: Uint8Array, key: Hex | Uint8Array): Promise<Sealed> => seal(data, key);

/** Throws `CryptoError` on a wrong key, a modified ciphertext or a malformed input. The message never includes content. */
export async function decryptBytes(sealed: { ciphertext: Uint8Array; iv: Uint8Array }, key: Hex | Uint8Array): Promise<Uint8Array> {
  if (sealed.iv.length !== IV_BYTES) throw new CryptoError(`iv must be ${IV_BYTES} bytes`);
  if (sealed.ciphertext.length < TAG_BYTES) throw new CryptoError("ciphertext is too short");
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(sealed.iv) }, await importKey(key), new Uint8Array(sealed.ciphertext));
    return new Uint8Array(plain);
  } catch (e) {
    if (e instanceof CryptoError) throw e;
    throw new CryptoError("decryption failed");
  }
}

export async function decrypt(sealed: { ciphertext: Uint8Array; iv: Uint8Array }, key: Hex | Uint8Array): Promise<string> {
  return new TextDecoder().decode(await decryptBytes(sealed, key));
}

export const toBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");
export const fromBase64 = (value: string): Uint8Array => new Uint8Array(Buffer.from(value, "base64"));
export { bytesToHex };
