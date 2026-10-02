import { createPasskeyWithPrfOutput, getPasskeyPrfOutput, isMeraError } from "@category-labs/mera";
import { deriveKeysFromPhrase, recoveryPhraseFromPrf } from "./keys";
import { PasskeyError, type PasskeyService } from "./types";
import { abortableWebAuthnClient } from "./webauthn";

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

export function createMeraPasskeyService(): PasskeyService {
  return {
    async create({ signal } = {}) {
      try {
        const r = await createPasskeyWithPrfOutput({
          rp: { id: rpId(), name: "Hive" },
          user: { name: "Hive account", displayName: "Hive" },
          webAuthnClient: abortableWebAuthnClient(signal),
        });
        return { credentialId: r.credentialId, prfOutput: r.prfOutput };
      } catch (e) {
        throw toPasskeyError(e, signal);
      }
    },
    async signIn({ signal, credentialId } = {}) {
      try {
        const r = await getPasskeyPrfOutput({
          rpId: rpId(),
          credential: credentialId ? { credentialId } : undefined,
          webAuthnClient: abortableWebAuthnClient(signal),
        });
        return { credentialId: r.credentialId, prfOutput: r.prfOutput };
      } catch (e) {
        throw toPasskeyError(e, signal);
      }
    },
    deriveKeys: ({ prfOutput }) => deriveKeysFromPhrase(recoveryPhraseFromPrf(prfOutput)),
  };
}
