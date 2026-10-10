import type { Hex } from "@hive/shared";
import { UnknownAgentError, type ChainAgent, type ChainEdge, type ChainReader, type ChainSlot, type CiphertextStore, type NewCiphertext, type PutVaultResult, type StoredCiphertext, type VaultStore } from "./types.js";

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
  async slot(slotId: bigint) {
    return this.slots.find((s) => s.id === slotId);
  }
  async agent(agentId: bigint) {
    const a = this.agents.get(agentId);
    if (!a) throw new UnknownAgentError(agentId);
    return a;
  }
  async agentsOf(owner: Hex) {
    return [...this.agents.values()].filter((a) => a.owner.toLowerCase() === owner.toLowerCase()).sort((a, b) => Number(a.id - b.id));
  }
}

// Used by tests, and by `pnpm dev` when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are unset. The real store is store.ts.
export class InMemoryCiphertextStore implements CiphertextStore {
  private rows = new Map<string, StoredCiphertext>();
  async get(contentHash: Hex) {
    return this.rows.get(contentHash.toLowerCase());
  }
  async getMany(contentHashes: readonly Hex[]) {
    const out = new Map<string, StoredCiphertext>();
    for (const hash of contentHashes) {
      const row = this.rows.get(hash.toLowerCase());
      if (row) out.set(hash.toLowerCase(), row);
    }
    return out;
  }
  async put(contentHash: Hex, { ciphertext, iv }: NewCiphertext) {
    this.rows.set(contentHash.toLowerCase(), { ciphertext, iv });
  }
}

// Used by tests, and by `pnpm dev` when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are unset. The real store is vaults.ts.
export class InMemoryVaultStore implements VaultStore {
  private rows = new Map<string, { owner: string; vault: Record<string, unknown> }>();
  async get(credentialId: string) {
    return this.rows.get(credentialId)?.vault;
  }
  async put(credentialId: string, owner: Hex, vault: Record<string, unknown>): Promise<PutVaultResult> {
    const row = this.rows.get(credentialId);
    if (row && row.owner !== owner.toLowerCase()) return "forbidden";
    this.rows.set(credentialId, { owner: owner.toLowerCase(), vault });
    return row ? "replaced" : "created";
  }
}
