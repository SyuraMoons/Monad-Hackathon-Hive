"use client";

import { getPasskeyService, PasskeyError, type PrfSecret } from "@/lib/passkey";
import type { HiveSigner } from "./signer";

// Same derivation as the app (ADR-005): PRF output -> 24-word phrase -> owner key.
// rp.id comes from NEXT_PUBLIC_PASSKEY_RP_ID in lib/passkey, so /smoke and the app share one passkey.

export interface MeraConnection {
  signer: HiveSigner;
  credentialId: string;
}

async function signerFrom(secret: PrfSecret): Promise<HiveSigner> {
  const svc = await getPasskeyService();
  const keys = await svc.deriveKeys(secret);
  return { account: keys.owner, end: () => keys.end() };
}

// Creates a passkey and returns its signer plus the credential id (used to resume later).
export async function connectMeraSigner(): Promise<MeraConnection> {
  const svc = await getPasskeyService();
  const secret = await svc.create();
  return { signer: await signerFrom(secret), credentialId: secret.credentialId };
}

// Resumes a previously created passkey by credential id.
export async function resumeMeraSigner(credentialId: string): Promise<HiveSigner> {
  const svc = await getPasskeyService();
  return signerFrom(await svc.signIn({ credentialId }));
}

export function describeMeraError(err: unknown): string {
  if (err instanceof PasskeyError) return err.message;
  return err instanceof Error ? err.message : String(err);
}
