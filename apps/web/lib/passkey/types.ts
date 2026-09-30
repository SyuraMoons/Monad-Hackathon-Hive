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

/** Keys derived from one passkey (rules §5.5). Held in memory only; call `end()` on sign-out. */
export type HiveKeys = {
  /** m/44'/60'/0'/0/0, a Mera signing session behind a viem account. */
  owner: LocalAccount;
  ownerAddress: Address;
  /** HKDF(prf, info "hive/encrypt"): 32 raw bytes for AES-256-GCM. Delegated to the bridge on authorize. */
  encryptionKey: Uint8Array;
  /** m/44'/60'/0'/0/{n}, the scoped key handed to the bridge for agent n (n ≥ 1). */
  agentPrivateKey(n: number): Hex;
  /** Zeroes every key copy this object holds. */
  end(): void;
};

/** Mera behind an interface, so the login screen doesn't care whether it's real or mocked. */
export interface PasskeyService {
  readonly kind: "mera" | "mock";
  /** Creates a new discoverable passkey with PRF and returns its first output. */
  create(options?: { signal?: AbortSignal }): Promise<PrfSecret>;
  /** Asks for any Hive passkey on this device and returns its PRF output. */
  signIn(options?: { signal?: AbortSignal }): Promise<PrfSecret>;
  /** Derives the owner, encryption and agent keys from a PRF output (rules §5.5). */
  deriveKeys(secret: PrfSecret): Promise<HiveKeys>;
}
