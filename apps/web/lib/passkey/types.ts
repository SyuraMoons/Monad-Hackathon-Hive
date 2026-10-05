import type { Address, Hex } from "@hive/shared";
import type { LocalAccount } from "viem";

/** The 32-byte WebAuthn PRF output. Every Hive key is derived from it, on this device. */
export type PrfSecret = { credentialId: string; prfOutput: Uint8Array };

export type PasskeyErrorCode =
  | "CANCELLED" //        the user pressed Cancel in Hive (AbortController)
  | "NOT_ALLOWED" //      prompt closed, timed out, or no passkey for this site (NotAllowedError)
  | "PRF_UNAVAILABLE" //  the authenticator can't produce a PRF output (gotchas.md)
  | "UNSUPPORTED" //      no WebAuthn / Web Crypto here (not HTTPS or localhost, old browser)
  | "UNKNOWN";

export class PasskeyError extends Error {
  readonly code: PasskeyErrorCode;
  constructor(code: PasskeyErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PasskeyError";
    this.code = code;
  }
}

/** Keys derived from one recovery phrase (rules §5.5). Held in memory only; call `end()` on sign-out. */
export type HiveKeys = {
  /** m/44'/60'/0'/0/0, a Mera signing session behind a viem account. */
  owner: LocalAccount;
  ownerAddress: Address;
  /** HKDF(BIP-39 seed, info "hive/encrypt"): 32 raw bytes for AES-256-GCM. Delegated to the bridge on authorize. */
  encryptionKey: Uint8Array;
  /** m/44'/60'/0'/0/{n}, the scoped key handed to the bridge for agent n (n ≥ 1). */
  agentPrivateKey(n: number): Hex;
  /** Zeroes every key copy this object holds. */
  end(): void;
};

/** Mera passkey ceremonies. Always real: there is no mock passkey, not even in mock mode. */
export interface PasskeyService {
  /** Creates a new discoverable passkey with PRF and returns its first output. */
  create(options?: { signal?: AbortSignal }): Promise<PrfSecret>;
  /** Asks for a Hive passkey and returns its PRF output: any passkey for this site, or only `credentialId`. */
  signIn(options?: { signal?: AbortSignal; credentialId?: string }): Promise<PrfSecret>;
  /** PRF output → 24-word recovery phrase → owner, encryption and agent keys (rules §5.5). */
  deriveKeys(secret: PrfSecret): Promise<HiveKeys>;
}
