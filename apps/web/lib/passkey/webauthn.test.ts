import { afterEach, describe, expect, it, vi } from "vitest";
import { abortableWebAuthnClient, type SecondPrf } from "./webauthn";

const buf = (fill: number) => new Uint8Array(32).fill(fill).buffer;
const SALT_A = new Uint8Array(32).fill(1);
const SALT_B = new Uint8Array(32).fill(2);

type Ext = { prf: { eval: { first: Uint8Array; second?: Uint8Array } } };

/** A fake navigator.credentials that records the extensions it was asked for and answers with `results`. */
function stubCredentials(results: { first?: ArrayBuffer; second?: ArrayBuffer }) {
  const asked: Ext[] = [];
  const cred = {
    rawId: new Uint8Array([1, 2, 3]).buffer,
    response: { getTransports: () => ["internal"] },
    getClientExtensionResults: () => ({ prf: { enabled: true, results } }),
  };
  const record = async (o: { publicKey: { extensions: Ext } }) => {
    asked.push(o.publicKey.extensions);
    return cred;
  };
  vi.stubGlobal("navigator", { credentials: { get: record, create: record } });
  return asked;
}

const getReq = { rpId: "localhost", challenge: new Uint8Array(32), prfSalt: SALT_A, userVerification: "required" } as never;
const createReq = {
  rp: { id: "localhost", name: "Hive" }, user: { id: new Uint8Array(8), name: "n", displayName: "d" }, challenge: new Uint8Array(32),
  algorithms: [-7], residentKey: "required", userVerification: "required", attestation: "none", prfSalt: SALT_A,
} as never;

afterEach(() => vi.unstubAllGlobals());

describe("abortableWebAuthnClient", () => {
  it("asks for one salt when no second is given, as before", async () => {
    const asked = stubCredentials({ first: buf(0xa1) });
    const out = await abortableWebAuthnClient().getCredential(getReq);
    expect(asked[0]!.prf.eval).toEqual({ first: SALT_A });
    expect(out.prfOutput).toEqual(new Uint8Array(32).fill(0xa1));
  });

  it("asks for both salts in one assertion and hands the second output to the caller only", async () => {
    const asked = stubCredentials({ first: buf(0xa1), second: buf(0xb2) });
    const second: SecondPrf = { salt: SALT_B };
    const out = await abortableWebAuthnClient(undefined, second).getCredential(getReq);
    expect(asked).toHaveLength(1);
    expect(asked[0]!.prf.eval).toEqual({ first: SALT_A, second: SALT_B });
    expect(out.prfOutput).toEqual(new Uint8Array(32).fill(0xa1));
    expect(second.output).toEqual(new Uint8Array(32).fill(0xb2));
    expect(Object.keys(out)).not.toContain("second");
  });

  it("asks for both salts when creating a passkey too", async () => {
    const asked = stubCredentials({ first: buf(0xa1), second: buf(0xb2) });
    const second: SecondPrf = { salt: SALT_B };
    const out = await abortableWebAuthnClient(undefined, second).createCredential(createReq);
    expect(asked[0]!.prf.eval).toEqual({ first: SALT_A, second: SALT_B });
    expect(out.prfOutput).toEqual(new Uint8Array(32).fill(0xa1));
    expect(second.output).toEqual(new Uint8Array(32).fill(0xb2));
  });

  it("leaves the second output unset when the authenticator answers only the first", async () => {
    stubCredentials({ first: buf(0xa1) });
    const second: SecondPrf = { salt: SALT_B };
    await abortableWebAuthnClient(undefined, second).getCredential(getReq);
    expect(second.output).toBeUndefined();
  });

  it("keeps a second output from an earlier step when a later one has none", async () => {
    // Creation without PRF results, then Mera's fallback assertion: the output of either step counts.
    const second: SecondPrf = { salt: SALT_B, output: new Uint8Array(32).fill(0xb2) };
    stubCredentials({ first: buf(0xa1) });
    await abortableWebAuthnClient(undefined, second).getCredential(getReq);
    expect(second.output).toEqual(new Uint8Array(32).fill(0xb2));
  });
});
