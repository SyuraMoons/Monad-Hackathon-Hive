import { HDKey } from "viem/accounts";

// Key derivation from the passkey PRF output (docs/architecture.md "Keys").
// The PRF output is 32 bytes of authenticator-bound entropy; we use it as the
// BIP-32 seed. The owner key is the EVM default path. Per-agent scoped keys
// reuse the same path with a different final index (planned — see architecture).
const OWNER_PATH = "m/44'/60'/0'/0/0";

export function deriveOwnerPrivateKey(prfOutput: Uint8Array): Uint8Array {
  if (prfOutput.length !== 32) {
    throw new Error("PRF output must be 32 bytes");
  }
  const owner = HDKey.fromMasterSeed(prfOutput).derive(OWNER_PATH);
  if (!owner.privateKey) {
    throw new Error("failed to derive owner key");
  }
  return owner.privateKey;
}
