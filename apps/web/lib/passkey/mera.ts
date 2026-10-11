import { createPasskeyWithPrfOutput, getPasskeyPrfOutput, isMeraError } from "@category-labs/mera";
import { deriveKeysFromPhrase, MEMORY_PRF_SALT, recoveryPhraseFromPrf } from "./keys";
import { PasskeyError, type PasskeyService } from "./types";
import { abortableWebAuthnClient, type SecondPrf } from "./webauthn";

// Passkeys are bound to this domain (gotchas.md): lock NEXT_PUBLIC_PASSKEY_RP_ID before the demo.
const rpId = () => process.env.NEXT_PUBLIC_PASSKEY_RP_ID || window.location.hostname;

/** Walks the `cause` chain looking for a DOMException name such as NotAllowedError. */
function domErrorName(e: unknown): string | undefined {
  for (let cur = e, i = 0; cur && i < 5; i++) {
    if (cur instanceof DOMException) return cur.name;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

function toPasskeyError(e: unknown, signal?: AbortSignal): PasskeyError {
  if (e instanceof PasskeyError) return e;
  if (signal?.aborted || domErrorName(e) === "AbortError") return new PasskeyError("CANCELLED", "The passkey request was cancelled.", { cause: e });
  if (isMeraError(e)) {
    if (e.code === "PRF_UNAVAILABLE") return new PasskeyError("PRF_UNAVAILABLE", "This passkey can't create encryption keys.", { cause: e });
    if (e.code === "CRYPTO_UNAVAILABLE") return new PasskeyError("UNSUPPORTED", "This browser lacks the Web Crypto features Hive needs.", { cause: e });
  }
  const name = domErrorName(e);
  if (name === "NotAllowedError" || name === "InvalidStateError") return new PasskeyError("NOT_ALLOWED", "The passkey prompt was closed or no passkey was found.", { cause: e });
  if (name === "SecurityError" || name === "NotSupportedError" || typeof navigator?.credentials === "undefined") {
    return new PasskeyError("UNSUPPORTED", "Passkeys need HTTPS or localhost in a current browser.", { cause: e });
  }
  if (isMeraError(e) && e.code === "PASSKEY_OPERATION_FAILED") return new PasskeyError("NOT_ALLOWED", e.message, { cause: e });
  return new PasskeyError("UNKNOWN", e instanceof Error ? e.message : String(e), { cause: e });
}

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * The memory namespace's PRF output (ADR-029). Normally the ceremony that just ran already answered it. An authenticator
 * that answers only one salt per ceremony is asked again through Mera with the memory salt, which is a second prompt.
 */
async function memoryOutput(second: SecondPrf, credentialId: string, accountOutput: Uint8Array, signal?: AbortSignal): Promise<Uint8Array> {
  let out = second.output;
  if (out?.length !== 32) {
    const r = await getPasskeyPrfOutput({ rpId: rpId(), credential: { credentialId }, prfSalt: MEMORY_PRF_SALT, webAuthnClient: abortableWebAuthnClient(signal) });
    out = r.prfOutput;
  }
  // Two salts must give two unrelated outputs. An authenticator that echoes one would put the memory key back under the account.
  if (same(out, accountOutput)) throw new PasskeyError("PRF_UNAVAILABLE", "This passkey can't create a separate encryption key.");
  return out;
}

export function createMeraPasskeyService(): PasskeyService {
  return {
    async create({ signal } = {}) {
      const second: SecondPrf = { salt: MEMORY_PRF_SALT };
      try {
        const r = await createPasskeyWithPrfOutput({
          rp: { id: rpId(), name: "Hive" },
          user: { name: "Hive account", displayName: "Hive" },
          webAuthnClient: abortableWebAuthnClient(signal, second),
        });
        return { credentialId: r.credentialId, prfOutput: r.prfOutput, memoryPrfOutput: await memoryOutput(second, r.credentialId, r.prfOutput, signal) };
      } catch (e) {
        throw toPasskeyError(e, signal);
      }
    },
    async signIn({ signal, credentialId } = {}) {
      const second: SecondPrf = { salt: MEMORY_PRF_SALT };
      try {
        const r = await getPasskeyPrfOutput({
          rpId: rpId(),
          credential: credentialId ? { credentialId } : undefined,
          webAuthnClient: abortableWebAuthnClient(signal, second),
        });
        return { credentialId: r.credentialId, prfOutput: r.prfOutput, memoryPrfOutput: await memoryOutput(second, r.credentialId, r.prfOutput, signal) };
      } catch (e) {
        throw toPasskeyError(e, signal);
      }
    },
    deriveKeys: ({ prfOutput, memoryPrfOutput }) => deriveKeysFromPhrase(recoveryPhraseFromPrf(prfOutput), memoryPrfOutput),
  };
}
