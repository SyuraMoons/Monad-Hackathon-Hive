import { MOCK_PRF } from "@/lib/hive/mock/data";
import { latency, mockFlag } from "@/lib/hive/mock/flags";
import { deriveHiveKeys } from "./keys";
import { PasskeyError, type PasskeyService, type PrfSecret } from "./types";

// Development only. Flags: ?mock=reject (prompt closed) · ?mock=prf-unavailable
// The PRF output is fixed, so the mock owner address is stable across reloads.

async function prompt(signal?: AbortSignal): Promise<PrfSecret> {
  await Promise.race([
    (async () => { await latency(); await latency(); })(),
    new Promise<never>((_, reject) => signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })),
  ]).catch(() => {
    throw new PasskeyError("CANCELLED", "The passkey request was cancelled.");
  });
  if (mockFlag("reject")) throw new PasskeyError("NOT_ALLOWED", "The passkey prompt was closed or no passkey was found.");
  if (mockFlag("prf-unavailable")) throw new PasskeyError("PRF_UNAVAILABLE", "This passkey can't create encryption keys.");
  return { credentialId: "mock-credential", prfOutput: new Uint8Array(MOCK_PRF) };
}

export function createMockPasskeyService(): PasskeyService {
  return {
    kind: "mock",
    create: ({ signal } = {}) => prompt(signal),
    signIn: ({ signal } = {}) => prompt(signal),
    deriveKeys: deriveHiveKeys,
  };
}
