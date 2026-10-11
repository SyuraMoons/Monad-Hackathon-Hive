import { HiveError } from "@hive/shared";
import { decodeErc8004RegisteredId, registerErc8004Identity } from "../account";
import type { HiveSigner } from "../signer";
import type { IdentityDeps } from "./identity";
import { confirmed } from "./registryChain";

/** The signer pays gas (ADR-006). The write goes through account.ts, which sets an explicit gas limit (rule 5). */
export function chainIdentity(signer: HiveSigner): IdentityDeps {
  return {
    async register(agentURI, agentId) {
      const txHash = await registerErc8004Identity(signer, agentURI, agentId);
      const erc8004Id = decodeErc8004RegisteredId(await confirmed(txHash));
      if (erc8004Id === undefined) throw new HiveError("CHAIN_ERROR", "The identity receipt has no ERC-8004 id.");
      return { erc8004Id, txHash };
    },
  };
}
