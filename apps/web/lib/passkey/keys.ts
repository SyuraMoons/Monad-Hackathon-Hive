import { createSecp256k1SigningSession, getEvmAddress } from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { zAddress, type Hex } from "@hive/shared";
import { entropyToMnemonic, mnemonicToSeed, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { hexToBytes, sha256, stringToBytes } from "viem";
import { HDKey } from "viem/accounts";
import type { HiveKeys } from "./types";

const ownerPath = "m/44'/60'/0'/0/0";
const agentPath = (n: number) => `m/44'/60'/0'/0/${n}`;
// Never rename these three strings: each one decides a key, and a new string makes existing ciphertext unreadable (ADR-008, ADR-029).
const LEGACY_ENCRYPT_INFO = new TextEncoder().encode("hive/encrypt");
const MEMORY_KEY_INFO = new TextEncoder().encode("hive/memory-key/v1");
/** The PRF salt of the memory namespace: 32 bytes, unrelated to Mera's default salt that derives the account. */
export const MEMORY_PRF_SALT: Uint8Array = hexToBytes(sha256(stringToBytes("hive/prf/memory/v1")));

const toHex = (bytes: Uint8Array): Hex => `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;

/** The account's 24-word BIP-39 phrase: the 32-byte PRF output used as entropy. Same passkey, same phrase. */
export function recoveryPhraseFromPrf(prfOutput: Uint8Array): string {
  if (prfOutput.length !== 32) throw new Error("PRF output must be 32 bytes");
  return entropyToMnemonic(prfOutput, wordlist);
}

async function hkdf(secret: Uint8Array, info: Uint8Array): Promise<Uint8Array> {
  const ikm = await crypto.subtle.importKey("raw", secret as BufferSource, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: info as BufferSource }, ikm, 256);
  return new Uint8Array(bits);
}

/**
 * The account keys come from the recovery phrase, so the same phrase restores the same account anywhere
 * (MetaMask included: account 1 is the owner). JS strings can't be zeroed, so callers drop the phrase right away.
 * The memory key comes from the passkey's second PRF output and never from the phrase (ADR-029).
 */
export async function deriveKeysFromPhrase(phrase: string, memoryPrfOutput: Uint8Array): Promise<HiveKeys> {
  if (!validateMnemonic(phrase, wordlist)) throw new Error("Not a valid BIP-39 recovery phrase");
  if (memoryPrfOutput.length !== 32) throw new Error("Memory PRF output must be 32 bytes");
  const seed = await mnemonicToSeed(phrase); // zeroed by end()
  const root = HDKey.fromMasterSeed(seed);

  const ownerKey = new Uint8Array(root.derive(ownerPath).privateKey!);
  const session = createSecp256k1SigningSession({ privateKey: ownerKey });
  ownerKey.fill(0); // the Mera session keeps its own copy and zeroes it on end()
  const owner = toViemAccount(session);
  const ownerAddress = zAddress.parse(getEvmAddress(session.publicKey));

  const encryptionKey = await hkdf(memoryPrfOutput, MEMORY_KEY_INFO);
  const legacyEncryptionKey = await hkdf(seed, LEGACY_ENCRYPT_INFO);
  let ended = false;

  return {
    owner,
    ownerAddress,
    encryptionKey,
    legacyEncryptionKey,
    agentPrivateKey(n) {
      if (ended) throw new Error("Keys have been cleared. Sign in again.");
      if (!Number.isInteger(n) || n < 1) throw new Error("Agent key index starts at 1 (0 is the owner key)");
      const child = root.derive(agentPath(n)).privateKey!;
      return toHex(child);
    },
    end() {
      if (ended) return;
      ended = true;
      session.end();
      seed.fill(0);
      encryptionKey.fill(0);
      legacyEncryptionKey.fill(0);
      root.wipePrivateData();
    },
  };
}
