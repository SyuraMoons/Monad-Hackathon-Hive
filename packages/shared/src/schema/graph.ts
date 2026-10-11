import { z } from "zod";
import { zAddress, zAgentId, zAgentType, zContentHash, zEdgeId, zEdgeTopic, zSlotId, zTopic, zTxHash, zUnixSeconds } from "../ids.js";

// Envio entities the web app reads (rules §5.3): graph state, audit history, provenance.

export const zAgent = z.object({
  agentId: zAgentId,
  owner: zAddress,
  agentKey: zAddress,
  name: z.string().min(1).max(64),
  agentType: zAgentType,
  registeredAt: zUnixSeconds,
});

export const zEdge = z.object({
  edgeId: zEdgeId,
  from: zAgentId,
  to: zAgentId,
  topic: zEdgeTopic,
  expiresAt: zUnixSeconds,
  active: z.boolean(),
  addedTx: zTxHash,
  removedTx: zTxHash.nullable(),
});

export const zMemorySlot = z.object({
  slotId: zSlotId,
  agentId: zAgentId,
  contentHash: zContentHash,
  topic: zTopic,
  propagatedCount: z.number().int().nonnegative(),
  txHash: zTxHash,
  writtenAt: zUnixSeconds,
});

export const zPropagation = z.object({
  slotId: zSlotId,
  from: zAgentId,
  to: zAgentId,
  contentHash: zContentHash,
  topic: zTopic,
  txHash: zTxHash,
  at: zUnixSeconds,
});

export const zGraphSnapshot = z.object({ agents: z.array(zAgent), edges: z.array(zEdge) });

/** One row of the Audit page: an indexed contract event (rules §4 events). */
const audit = <K extends string, S extends z.ZodRawShape>(kind: K, shape: S) =>
  z.object({ kind: z.literal(kind), at: zUnixSeconds, txHash: zTxHash, ...shape });

export const zAuditEvent = z.discriminatedUnion("kind", [
  audit("agent.registered", { agentId: zAgentId, name: z.string(), agentType: zAgentType }),
  audit("edge.added", { edgeId: zEdgeId, from: zAgentId, to: zAgentId, topic: zEdgeTopic, expiresAt: zUnixSeconds }),
  audit("edge.removed", { edgeId: zEdgeId, from: zAgentId, to: zAgentId, topic: zEdgeTopic }),
  audit("memory.written", { slotId: zSlotId, agentId: zAgentId, contentHash: zContentHash, topic: zTopic, propagatedCount: z.number().int().nonnegative() }),
  audit("memory.propagated", { slotId: zSlotId, from: zAgentId, to: zAgentId, contentHash: zContentHash, topic: zTopic }),
]);

/** Counters for the Audit page strip, derived by the indexer. `violations` counts deliveries no active, unexpired edge explains and should be 0. */
const zCount = z.number().int().nonnegative();
export const zOwnerStats = z.object({ agents: zCount, edgesAdded: zCount, edgesRevoked: zCount, memories: zCount, propagations: zCount, violations: zCount });

/** Where one memory came from and where it went, looked up by content hash. */
export const zProvenance = z.object({ slot: zMemorySlot, propagations: z.array(zPropagation) });

export type Agent = z.infer<typeof zAgent>;
export type Edge = z.infer<typeof zEdge>;
export type MemorySlot = z.infer<typeof zMemorySlot>;
export type Propagation = z.infer<typeof zPropagation>;
export type GraphSnapshot = z.infer<typeof zGraphSnapshot>;
export type GraphSnapshotWire = z.input<typeof zGraphSnapshot>;
export type AuditEvent = z.infer<typeof zAuditEvent>;
export type OwnerStats = z.infer<typeof zOwnerStats>;
export type Provenance = z.infer<typeof zProvenance>;
