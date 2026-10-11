import { HiveError, zAgentType, zAuditEvent, zOwnerStats, zProvenance, type AuditEvent, type ContentHash, type OwnerStats, type Provenance } from "@hive/shared";

// The audit page and the provenance card, read from the Envio indexer (packages/indexer). The GraphQL call is
// injected (AuditDeps), so this file has no network in it. The index is for display only: it never decides access.

export type AuditDeps = {
  /** One GraphQL request. Rejects (with a HiveError) when the indexer can't be reached or answers errors. */
  query<T>(gql: string, variables: Record<string, unknown>): Promise<T>;
};

export const AUDIT_LIMIT = 500;

const AUDIT_FIELDS = "kind at txHash agentId name agentType edgeId fromAgent toAgent topic expiresAt slotId contentHash propagatedCount";

const AUDIT_QUERY = `query Audit($owner: String!, $limit: Int!) {
  AuditEvent(where: { owner: { _eq: $owner } }, order_by: [{ block: desc }, { logIndex: desc }], limit: $limit) { ${AUDIT_FIELDS} }
}`;

const PROVENANCE_QUERY = `query Provenance($hash: String!) {
  MemorySlot(where: { contentHash: { _eq: $hash } }, limit: 1) { id agentId contentHash topic propagatedCount txHash writtenAt }
  Propagation(where: { contentHash: { _eq: $hash } }, order_by: [{ at: asc }]) { slotId fromAgent toAgent contentHash topic txHash at }
}`;

type AuditRow = {
  kind: string; at: number; txHash: string;
  agentId: string | null; name: string | null; agentType: string | null; edgeId: string | null; fromAgent: string | null; toAgent: string | null;
  topic: string | null; expiresAt: number | null; slotId: string | null; contentHash: string | null; propagatedCount: number | null;
};

/** The indexer's flat row in the shape of zAuditEvent: each kind takes the fields it uses (from/to are fromAgent/toAgent there). */
function toEvent(r: AuditRow): unknown {
  const base = { kind: r.kind, at: r.at, txHash: r.txHash };
  switch (r.kind) {
    // The registry accepts any type string; one the app doesn't know is shown as "other", as the agent list does (registry.ts).
    case "agent.registered": return { ...base, agentId: r.agentId, name: r.name, agentType: zAgentType.safeParse(r.agentType).data ?? "other" };
    case "edge.added": return { ...base, edgeId: r.edgeId, from: r.fromAgent, to: r.toAgent, topic: r.topic, expiresAt: r.expiresAt };
    case "edge.removed": return { ...base, edgeId: r.edgeId, from: r.fromAgent, to: r.toAgent, topic: r.topic };
    case "memory.written": return { ...base, slotId: r.slotId, agentId: r.agentId, contentHash: r.contentHash, topic: r.topic, propagatedCount: r.propagatedCount };
    case "memory.propagated": return { ...base, slotId: r.slotId, from: r.fromAgent, to: r.toAgent, contentHash: r.contentHash, topic: r.topic };
    default: return null;
  }
}

/** The owner's events, newest first (the indexer orders by block and log index). A row the page can't show is skipped. */
export async function auditEvents(deps: AuditDeps, owner: string, limit = AUDIT_LIMIT): Promise<AuditEvent[]> {
  const { AuditEvent: rows } = await deps.query<{ AuditEvent: AuditRow[] }>(AUDIT_QUERY, { owner: owner.toLowerCase(), limit });
  const events: AuditEvent[] = [];
  for (const row of rows) {
    const parsed = zAuditEvent.safeParse(toEvent(row));
    if (parsed.success) events.push(parsed.data);
  }
  return events;
}

type SlotRow = { id: string; agentId: string; contentHash: string; topic: string; propagatedCount: number; txHash: string; writtenAt: number };
type PropagationRow = { slotId: string | null; fromAgent: string; toAgent: string; contentHash: string; topic: string; txHash: string; at: number };

/** Where one memory came from and where it went, by content hash. `null` when the indexer has no such slot. */
export async function provenance(deps: AuditDeps, contentHash: ContentHash): Promise<Provenance | null> {
  const data = await deps.query<{ MemorySlot: SlotRow[]; Propagation: PropagationRow[] }>(PROVENANCE_QUERY, { hash: contentHash.toLowerCase() });
  const slot = data.MemorySlot[0];
  if (!slot) return null;
  const parsed = zProvenance.safeParse({
    slot: { slotId: slot.id, agentId: slot.agentId, contentHash: slot.contentHash, topic: slot.topic, propagatedCount: slot.propagatedCount, txHash: slot.txHash, writtenAt: slot.writtenAt },
    propagations: data.Propagation.map((p) => ({ slotId: p.slotId ?? slot.id, from: p.fromAgent, to: p.toAgent, contentHash: p.contentHash, topic: p.topic, txHash: p.txHash, at: p.at })),
  });
  return parsed.success ? parsed.data : null;
}

const STATS_QUERY = `query OwnerStats($owner: String!) {
  OwnerStats(where: { id: { _eq: $owner } }, limit: 1) { agents edgesAdded edgesRevoked memories propagations violations }
}`;

const NO_STATS: OwnerStats = { agents: 0, edgesAdded: 0, edgesRevoked: 0, memories: 0, propagations: 0, violations: 0 };

/** Counters for the Audit strip. An owner the indexer has not seen yet has none, which reads as zeros. */
export async function ownerStats(deps: AuditDeps, owner: string): Promise<OwnerStats> {
  const { OwnerStats: rows } = await deps.query<{ OwnerStats: unknown[] }>(STATS_QUERY, { owner: owner.toLowerCase() });
  if (!rows.length) return NO_STATS;
  const parsed = zOwnerStats.safeParse(rows[0]);
  if (!parsed.success) throw new HiveError("INTERNAL", "The audit indexer sent unexpected stats.");
  return parsed.data;
}
