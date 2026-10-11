import type { WebAuthnClient } from "@category-labs/mera";

// Mera's built-in client can't be cancelled, so this one passes an AbortSignal to navigator.credentials.
// Mera still generates the challenge and its salt, and validates the first PRF output it gets back.
// A second salt can ride along in the same ceremony (ADR-029): Mera never sees its output, the caller reads it from `second`.

type PrfResults = { enabled?: boolean; results?: { first?: BufferSource; second?: BufferSource } };

/** A second PRF salt to evaluate in the same prompt. `output` is set when the authenticator answered it. */
export type SecondPrf = { salt: Uint8Array; output?: Uint8Array };

const bytes = (b: BufferSource | undefined) =>
  b === undefined ? undefined : new Uint8Array(b instanceof ArrayBuffer ? b : b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));

export function abortableWebAuthnClient(signal?: AbortSignal, second?: SecondPrf): WebAuthnClient {
  const evalFor = (first: Uint8Array<ArrayBuffer>) => (second ? { first, second: second.salt as BufferSource } : { first });
  const capture = (prf: PrfResults | undefined) => {
    if (second) second.output = bytes(prf?.results?.second) ?? second.output;
  };
  return {
    async createCredential(req) {
      const cred = (await navigator.credentials.create({
        signal,
        publicKey: {
          rp: { id: req.rp.id, name: req.rp.name },
          user: { id: req.user.id, name: req.user.name, displayName: req.user.displayName },
          challenge: req.challenge,
          pubKeyCredParams: req.algorithms.map((alg) => ({ type: "public-key" as const, alg })),
          authenticatorSelection: { residentKey: req.residentKey, requireResidentKey: true, userVerification: req.userVerification },
          attestation: req.attestation,
          timeout: req.timeout,
          extensions: { prf: { eval: evalFor(req.prfSalt) } },
        },
      })) as PublicKeyCredential | null;
      if (!cred) throw new DOMException("No credential was created", "NotAllowedError");
      const prf = (cred.getClientExtensionResults() as { prf?: PrfResults }).prf;
      capture(prf);
      const response = cred.response as AuthenticatorAttestationResponse;
      return {
        credentialId: new Uint8Array(cred.rawId),
        transports: typeof response.getTransports === "function" ? response.getTransports() : undefined,
        prfEnabled: prf?.enabled === true || prf?.results?.first !== undefined,
        prfOutput: bytes(prf?.results?.first),
      };
    },

    async getCredential(req) {
      const cred = (await navigator.credentials.get({
        signal,
        publicKey: {
          rpId: req.rpId,
          challenge: req.challenge,
          allowCredentials: req.allowCredential
            ? [{ type: "public-key", id: req.allowCredential.credentialId, transports: req.allowCredential.transports as AuthenticatorTransport[] | undefined }]
            : undefined,
          userVerification: req.userVerification,
          timeout: req.timeout,
          extensions: { prf: { eval: evalFor(req.prfSalt) } },
        },
      })) as PublicKeyCredential | null;
      if (!cred) throw new DOMException("No passkey was selected", "NotAllowedError");
      const prf = (cred.getClientExtensionResults() as { prf?: PrfResults }).prf;
      capture(prf);
      return { credentialId: new Uint8Array(cred.rawId), prfOutput: bytes(prf?.results?.first) };
    },
  };
}
