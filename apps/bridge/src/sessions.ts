import type { Hex, MemoryDoc } from "@hive/shared";

/**
 * Decrypted memories of one session, by contentHash. A hash names its content, so an entry never goes stale; it only
 * saves the fetch and the decrypt. It is not a permission check: every call still reads the chain first (ADR-022).
 */
export class DocCache {
  private rows = new Map<string, MemoryDoc>();
  constructor(private max = 2000) {}

  get(contentHash: string): MemoryDoc | undefined {
    const key = contentHash.toLowerCase();
    const doc = this.rows.get(key);
    if (doc) {
      this.rows.delete(key);
      this.rows.set(key, doc);
    }
    return doc;
  }

  set(contentHash: string, doc: MemoryDoc): void {
    const key = contentHash.toLowerCase();
    this.rows.delete(key);
    this.rows.set(key, doc);
    if (this.rows.size > this.max) this.rows.delete(this.rows.keys().next().value!);
  }

  get size(): number {
    return this.rows.size;
  }
}

export type AgentSession = {
  agentId: bigint;
  name: string;
  owner: string;
  /** Delegated by the owner's passkey. Lives in memory only and is dropped on sign-out or restart. */
  encryptionKey: Hex;
  agentPrivateKey: Hex;
  expiresAt: number;
  lastCallAt: number | null;
  /** Dropped with the session, never logged or stored. */
  docs: DocCache;
};

/** In-memory agent sessions. Keys never touch disk, logs or responses. */
export class SessionStore {
  private rows = new Map<string, AgentSession>();
  constructor(private now: () => number = () => Math.floor(Date.now() / 1000)) {}

  /** Authorizing again for the same owner keeps `lastCallAt`: the agent already called, a reload doesn't make it new. */
  put(session: Omit<AgentSession, "lastCallAt" | "docs">): void {
    const prev = this.get(session.agentId);
    const keep = prev && prev.owner.toLowerCase() === session.owner.toLowerCase() ? prev.lastCallAt : null;
    this.rows.set(session.agentId.toString(), { ...session, lastCallAt: keep, docs: new DocCache() });
  }

  /** Live sessions only: an expired one is deleted on lookup. */
  get(agentId: bigint): AgentSession | undefined {
    const row = this.rows.get(agentId.toString());
    if (!row) return undefined;
    if (row.expiresAt <= this.now()) {
      this.rows.delete(agentId.toString());
      return undefined;
    }
    return row;
  }

  touch(agentId: bigint): void {
    const row = this.get(agentId);
    if (row) row.lastCallAt = this.now();
  }

  delete(agentId: bigint): void {
    this.rows.delete(agentId.toString());
  }

  deleteByOwner(owner: string): void {
    for (const [id, row] of this.rows) if (row.owner.toLowerCase() === owner.toLowerCase()) this.rows.delete(id);
  }

  listByOwner(owner: string): AgentSession[] {
    return [...this.rows.values()].filter((r) => r.owner.toLowerCase() === owner.toLowerCase() && this.get(r.agentId));
  }

  count(): number {
    for (const row of [...this.rows.values()]) this.get(row.agentId);
    return this.rows.size;
  }
}
