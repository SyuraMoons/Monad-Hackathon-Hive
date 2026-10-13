import { getAddress, isAddress, type Address, type Hex } from "viem";
import { z } from "zod";

export type { Address, Hex };

const MAX_UINT256 = 2n ** 256n - 1n;

/** uint256 on the wire: a decimal string (JSON has no bigint). Parses to `bigint`. */
export const zUint256 = z
  .string()
  .regex(/^(0|[1-9]\d*)$/, "expected a decimal integer string")
  .transform((s) => BigInt(s))
  .refine((n) => n <= MAX_UINT256, "exceeds uint256");

/** Agent ID: uint256 onchain, decimal string in JSON, bigint in TS. */
export const zAgentId = zUint256;
export type AgentId = bigint;

/** Edge ID: uint256 assigned by KnowledgeGraph.addEdge. */
export const zEdgeId = zUint256;
export type EdgeId = bigint;

/** Memory slot ID: uint256 assigned by MemorySlots.write. */
export const zSlotId = zUint256;
export type SlotId = bigint;

/** Topic: lowercase slug. Onchain it is a `string` in `MemorySlots` and `keccak256(topic)` in `KnowledgeGraph` (and the bridge's `topicHash`); there is no bytes32 form of it. */
export const zTopic = z.string().regex(/^[a-z0-9-]{1,31}$/, "topic must match ^[a-z0-9-]{1,31}$").brand<"Topic">();
export type Topic = z.infer<typeof zTopic>;

/** Edge topic meaning "every topic". Only edges carry it: slot topics stay `zTopic`, so no real topic can collide with it. */
export const ALL_TOPICS = "*";
export const zEdgeTopic = z.union([z.literal(ALL_TOPICS), zTopic]);
export type EdgeTopic = z.infer<typeof zEdgeTopic>;

const zBytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "expected 32-byte hex").transform((s) => s.toLowerCase() as Hex);

/** keccak256(iv ‖ ciphertext), never a hash of plaintext. */
export const zContentHash = zBytes32.brand<"ContentHash">();
export type ContentHash = z.infer<typeof zContentHash>;

/** Transaction hash. */
export const zTxHash = zBytes32.brand<"TxHash">();
export type TxHash = z.infer<typeof zTxHash>;

/** Any EVM address, normalised to its checksummed form. */
export const zAddress = z.string().refine((s) => isAddress(s, { strict: false }), "invalid address").transform((s) => getAddress(s));

export const AGENT_TYPES = ["claude", "gpt", "deepseek", "therapy-bot", "other"] as const;
export const zAgentType = z.enum(AGENT_TYPES);
export type AgentType = z.infer<typeof zAgentType>;

/** Unix seconds, the only timestamp unit in any API. */
export const zUnixSeconds = z.number().int().nonnegative();
export type UnixSeconds = number;

export const zHex = z.string().regex(/^0x([0-9a-fA-F]{2})*$/, "expected hex bytes").transform((s) => s as Hex);
export const zBase64 = z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/, "expected base64");
