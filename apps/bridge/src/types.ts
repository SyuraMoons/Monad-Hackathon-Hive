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
  put(contentHash: Hex, value: NewCiphertext): Promise<void>;
}
