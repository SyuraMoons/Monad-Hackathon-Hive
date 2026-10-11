import { HiveError, agentCardUrl } from "@hive/shared";
import { BaseError, type Hex } from "viem";
import { isOutOfFunds } from "./registry";

// The optional third registration step: an ERC-8004 identity for an agent (ADR-028). The chain call is injected
// (IdentityDeps), so this file has no RPC in it and its tests run against fakes. The real deps are in identityChain.ts.

export type IdentityDeps = {
  /** Sends `register(agentURI, [hiveAgentId])` to the ERC-8004 registry and resolves with the new id once the receipt is in. */
  register(agentURI: string, agentId: bigint): Promise<{ erc8004Id: bigint; txHash: Hex }>;
};

/**
 * The URI written onchain for an agent, or null when there is no bridge URL fit for a public registry.
 * Only `https` passes: a local bridge would put a `localhost` link where everyone can read it.
 */
export function identityCardUrl(bridgeUrl: string | undefined, agentId: bigint): string | null {
  if (!bridgeUrl) return null;
  try {
    const url = new URL(bridgeUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    return agentCardUrl(url.toString(), agentId);
  } catch {
    return null;
  }
}

/** Fixed messages only: nothing from the RPC or the signer goes into them. */
function toHiveError(e: unknown): HiveError {
  if (e instanceof HiveError) return e;
  if (e instanceof BaseError && e.walk(isOutOfFunds) !== null) {
    return new HiveError("CHAIN_ERROR", "Your account has no MON for gas. Get test MON from the faucet, then try again.");
  }
  return new HiveError("CHAIN_ERROR", "Could not add the ERC-8004 identity on Monad.");
}

export async function registerIdentity(deps: IdentityDeps, input: { bridgeUrl: string | undefined; agentId: bigint }): Promise<{ erc8004Id: bigint; txHash: Hex }> {
  const uri = identityCardUrl(input.bridgeUrl, input.agentId);
  if (!uri) throw new HiveError("INVALID_INPUT", "An ERC-8004 identity needs a public https bridge. This app is using a local one.");
  try {
    return await deps.register(uri, input.agentId);
  } catch (e) {
    throw toHiveError(e);
  }
}
