import { decodeAbiParameters, encodeAbiParameters, getAddress, type Address, type Hex } from "viem";
import { z } from "zod";
import { zAddress, zAgentId, zAgentType } from "./ids.js";

/**
 * ERC-8004 Identity Registry on Monad testnet (ADR-028). Not ours: a public registry any agent can join.
 * It gives a Hive agent an identity other tools can find. It never decides what an agent may read (rule 3).
 */
export const erc8004Deployment = {
  chainId: 10143,
  identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
} as const;

/** The part of the registry Hive uses. Hand-written: the registry is not built from `packages/contracts`. */
export const Erc8004IdentityRegistryAbi = [
  {
    type: "function",
    name: "register",
    inputs: [
      { name: "agentURI", type: "string" },
      { name: "metadata", type: "tuple[]", components: [{ name: "metadataKey", type: "string" }, { name: "metadataValue", type: "bytes" }] },
    ],
    outputs: [{ name: "agentId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  { type: "function", name: "getMetadata", inputs: [{ name: "agentId", type: "uint256" }, { name: "metadataKey", type: "string" }], outputs: [{ name: "", type: "bytes" }], stateMutability: "view" },
  { type: "function", name: "tokenURI", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "string" }], stateMutability: "view" },
  { type: "function", name: "ownerOf", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "address" }], stateMutability: "view" },
  {
    type: "event",
    name: "Registered",
    inputs: [{ name: "agentId", type: "uint256", indexed: true }, { name: "agentURI", type: "string", indexed: false }, { name: "owner", type: "address", indexed: true }],
    anonymous: false,
  },
  {
    type: "event",
    name: "MetadataSet",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "indexedMetadataKey", type: "string", indexed: true },
      { name: "metadataKey", type: "string", indexed: false },
      { name: "metadataValue", type: "bytes", indexed: false },
    ],
    anonymous: false,
  },
] as const;

/** Metadata key that points an ERC-8004 identity at a Hive agent. Written onchain, so it is never renamed (like `hive/encrypt`, ADR-008). */
export const ERC8004_HIVE_AGENT_KEY = "hiveAgentId";

const HIVE_AGENT_REF = [{ type: "address" }, { type: "uint256" }] as const;

/** Value stored under `ERC8004_HIVE_AGENT_KEY`: `abi.encode(agentRegistry, agentId)`. The registry address keeps ids from an older deploy apart (ADR-021). */
export const encodeHiveAgentRef = (agentRegistry: Address, agentId: bigint): Hex => encodeAbiParameters(HIVE_AGENT_REF, [agentRegistry, agentId]);

/**
 * Reads a `hiveAgentId` value. `undefined` for anything that is not exactly one address and one uint256.
 * It is a claim by whoever registered the identity: trust it only if that owner also owns the Hive agent.
 */
export function decodeHiveAgentRef(value: Hex): { agentRegistry: Address; agentId: bigint } | undefined {
  if (value.length !== 2 + 64 * 2) return undefined;
  try {
    const [agentRegistry, agentId] = decodeAbiParameters(HIVE_AGENT_REF, value);
    // viem ignores dirty padding above the address, so only a canonical encoding passes.
    if (encodeHiveAgentRef(agentRegistry, agentId) !== value.toLowerCase()) return undefined;
    return { agentRegistry: getAddress(agentRegistry), agentId };
  } catch {
    return undefined;
  }
}

/** Where the bridge serves an agent's card. Keyed by the Hive agent id, which exists before the ERC-8004 one. */
export const agentCardPath = (agentId: bigint) => `/agents/${agentId}/card.json`;
export const agentCardUrl = (bridgeUrl: string, agentId: bigint) => `${bridgeUrl.replace(/\/+$/, "")}${agentCardPath(agentId)}`;

export const ERC8004_REGISTRATION_TYPE = "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";

/**
 * The JSON an agent's ERC-8004 URI points to. Everything in it is already public onchain (ADR-023): no memory
 * content, no keys, no tokens. `registrations` stays empty until the bridge can look up the ERC-8004 id (planned).
 */
export const zAgentCard = z.object({
  type: z.literal(ERC8004_REGISTRATION_TYPE),
  name: z.string().min(1).max(64),
  description: z.string().max(280),
  services: z.array(z.object({ name: z.string().min(1), endpoint: z.url(), version: z.string().min(1).optional() })),
  x402Support: z.literal(false),
  active: z.boolean(),
  registrations: z.array(z.object({ agentId: zAgentId, agentRegistry: z.string().min(1) })),
  supportedTrust: z.array(z.string()),
  hive: z.object({ chainId: z.number().int().positive(), agentRegistry: zAddress, agentId: zAgentId, agentType: zAgentType, owner: zAddress }),
});
/** Wire shape (ids as decimal strings), what the bridge sends. */
export type AgentCardWire = z.input<typeof zAgentCard>;
export type AgentCard = z.output<typeof zAgentCard>;
