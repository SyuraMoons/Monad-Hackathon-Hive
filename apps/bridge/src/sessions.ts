import type { Hex } from "@hive/shared";

export type AgentSession = {
  agentId: bigint;
  name: string;
  owner: string;
  /** Delegated by the owner's passkey. Lives in memory only and is dropped on sign-out or restart. */
  encryptionKey: Hex;
  agentPrivateKey: Hex;
  expiresAt: number;
  lastCallAt: number | null;
};

/** In-memory agent sessions. Keys never touch disk, logs or responses. */
export class SessionStore {
  private rows = new Map<string, AgentSession>();
  constructor(private now: () => number = () => Math.floor(Date.now() / 1000)) {}

  put(session: Omit<AgentSession, "lastCallAt">): void {
    this.rows.set(session.agentId.toString(), { ...session, lastCallAt: null });
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
