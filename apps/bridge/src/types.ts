import type { Hex } from "@hive/shared";

// Shapes mirror the contracts (IKnowledgeGraph.Edge, IMemorySlots.Slot) so the real reader is a thin viem wrapper.
// Timestamps are unix seconds as bigint, like the chain.

export type ChainEdge = {
  id: bigint;
  from: bigint;
  to: bigint;
  /** keccak256(utf8 topic), exactly what KnowledgeGraph stores. */
  topicHash: Hex;
  expiresAt: bigint;
  active: boolean;
};

export type ChainSlot = {
  id: bigint;
  agentId: bigint;
  contentHash: Hex;
  topic: string;
  writtenAt: bigint;
};

export type ChainAgent = { id: bigint; name: string; owner: Hex; agentType: string; /** The key allowed to call MemorySlots.write for this agent. The zero address until setAgentWriter runs. */ writer: Hex };

/** `ChainReader.agent` rejects with this when the agent is not registered, so callers can tell "no such agent" from "RPC down". */
export class UnknownAgentError extends Error {
  constructor(agentId: bigint) {
    super(`unknown agent ${agentId}`);
    this.name = "UnknownAgentError";
  }
}

/** Live chain state. Every read-permission decision uses this, never Envio, so a revoke is effective immediately. */
export interface ChainReader {
  edgesTo(agentId: bigint): Promise<ChainEdge[]>;
  slotsSince(agentId: bigint, since: bigint): Promise<ChainSlot[]>;
  /** One slot by id, or undefined when it does not exist. Any rejection is a chain/RPC failure. */
  slot(slotId: bigint): Promise<ChainSlot | undefined>;
  /** Rejects with `UnknownAgentError` for an unregistered id. Any other rejection is a chain/RPC failure. */
  agent(agentId: bigint): Promise<ChainAgent>;
  /** Every agent the owner registered, oldest first. */
  agentsOf(owner: Hex): Promise<ChainAgent[]>;
}

export type StoredCiphertext = { ciphertext: Uint8Array; iv: Uint8Array };

/** What a write stores: the ciphertext plus whose it is and which key sealed it (memory_content.owner, key_id). */
export type NewCiphertext = StoredCiphertext & { owner: Hex; keyId: string };

/** Offchain ciphertext, keyed by contentHash = keccak256(iv ‖ ciphertext). Never holds plaintext. */
export interface CiphertextStore {
  get(contentHash: Hex): Promise<StoredCiphertext | undefined>;
  /** One round trip for many hashes. Keys of the result are lowercase hashes; a hash with no row is left out. */
  getMany(contentHashes: readonly Hex[]): Promise<Map<string, StoredCiphertext>>;
  put(contentHash: Hex, value: NewCiphertext): Promise<void>;
}

export type EmbedderStatus = "loading" | "ready" | "error";

/** Turns text into unit-length vectors, so cosine similarity is a dot product. Runs in the bridge: plaintext never leaves it (ADR-022). */
export interface Embedder {
  /** Names the vectors it makes. A vector of another model is never mixed in. */
  readonly model: string;
  readonly dims: number;
  status(): EmbedderStatus;
  embedQuery(text: string): Promise<Float32Array>;
  embedPassages(texts: string[]): Promise<Float32Array[]>;
}

/** Encrypted embedding vectors (memory_embedding), keyed by contentHash and model. Never holds a vector in the clear. */
export interface VectorStore {
  getVectors(contentHashes: readonly Hex[], model: string): Promise<Map<string, StoredCiphertext>>;
  putVector(contentHash: Hex, model: string, dims: number, value: NewCiphertext): Promise<void>;
}

export type PutVaultResult = "created" | "replaced" | "forbidden";

/** Mera secret vaults (ciphertext JSON) keyed by passkey credential ID. Write-once per credential: only the first owner may replace it. */
export interface VaultStore {
  get(credentialId: string): Promise<Record<string, unknown> | undefined>;
  put(credentialId: string, owner: Hex, vault: Record<string, unknown>): Promise<PutVaultResult>;
}

export type WriteReceipt = { txHash: Hex; slotId: bigint; propagatedTo: bigint[] };

/** Sends `MemorySlots.write` from the agent's own key (ADR-007) and reads the result from the receipt. */
export interface ChainWriter {
  write(args: { agentKey: Hex; agentId: bigint; contentHash: Hex; topic: string }): Promise<WriteReceipt>;
}
