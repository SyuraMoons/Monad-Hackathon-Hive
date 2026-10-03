"use client";

import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getPasskeyPrfOutput,
  isMeraError,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { deriveOwnerPrivateKey } from "./keys";
import type { HiveSigner } from "./signer";

// rp.id is domain-bound (docs/gotchas.md): a passkey created on localhost won't
// work on the Vercel URL. Pick the demo domain early and don't change it.
const RP_ID = process.env.NEXT_PUBLIC_MERA_RP_ID ?? "localhost";
const RP_NAME = "Hive";

export interface MeraUser {
  name: string;
  displayName: string;
}

function signerFromPrf(prfOutput: Uint8Array): HiveSigner {
  const session = createSecp256k1SigningSession({ privateKey: deriveOwnerPrivateKey(prfOutput) });
  return {
    account: toViemAccount(session),
    end: () => session.end(),
  };
}

// Creates a passkey and returns its signer plus the credential id (used to
// resume later). On authenticators that don't evaluate PRF during creation
// this prompts twice.
export interface MeraConnection {
  signer: HiveSigner;
  credentialId: string;
}

export async function connectMeraSigner(user: MeraUser): Promise<MeraConnection> {
  const { prfOutput, credentialId } = await createPasskeyWithPrfOutput({
    rp: { id: RP_ID, name: RP_NAME },
    user,
  });
  return { signer: signerFromPrf(prfOutput), credentialId };
}

// Resumes a previously created passkey by credential id.
export async function resumeMeraSigner(credentialId: string): Promise<HiveSigner> {
  const { prfOutput } = await getPasskeyPrfOutput({
    rpId: RP_ID,
    credential: { credentialId },
  });
  return signerFromPrf(prfOutput);
}

export function describeMeraError(err: unknown): string {
  if (isMeraError(err)) {
    switch (err.code) {
      case "PRF_UNAVAILABLE":
        return "This passkey doesn't return PRF output. Use Safari + iCloud Keychain, 1Password, or Chrome + Google Password Manager.";
      case "CRYPTO_UNAVAILABLE":
        return "WebCrypto is unavailable. Serve over HTTPS or localhost.";
      case "PASSKEY_OPERATION_FAILED":
        return "Passkey flow was cancelled or unavailable.";
      default:
        return err.message;
    }
  }
  return err instanceof Error ? err.message : String(err);
}
