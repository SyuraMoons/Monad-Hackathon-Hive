import type { Hex } from "@hive/shared";
import type { ChainAgent, ChainEdge, ChainReader, ChainSlot, CiphertextStore, StoredCiphertext } from "./types.js";

// STUB: replace when contracts are deployed (AK-7): a viem-backed ChainReader on the addresses from @hive/shared.
export class InMemoryChain implements ChainReader {
  agents = new Map<bigint, ChainAgent>();
  edges: ChainEdge[] = [];
  slots: ChainSlot[] = [];

  async edgesTo(agentId: bigint) {
    return this.edges.filter((e) => e.to === agentId);
  }
  async slotsSince(agentId: bigint, since: bigint) {
    return this.slots.filter((s) => s.agentId === agentId && s.writtenAt >= since);
  }
  async agent(agentId: bigint) {
    const a = this.agents.get(agentId);
    if (!a) throw new Error(`unknown agent ${agentId}`);
    return a;
  }
}

// STUB: replace when Supabase putCiphertext/getCiphertext lands (HF-2/3).
export class InMemoryCiphertextStore implements CiphertextStore {
  private rows = new Map<string, StoredCiphertext>();
  async get(contentHash: Hex) {
    return this.rows.get(contentHash.toLowerCase());
  }
  async put(contentHash: Hex, value: StoredCiphertext) {
    this.rows.set(contentHash.toLowerCase(), value);
  }
}
