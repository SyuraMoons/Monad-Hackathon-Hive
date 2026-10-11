import type { OwnerStats } from "@hive/shared";

export type StatTile = { label: string; value: string; note?: string };

/** The Audit strip's wording. `violations` are deliveries no active edge explains, so anything above 0 is flagged, never hidden. */
export function summarize(s: OwnerStats): { tiles: StatTile[]; policy: { ok: boolean; text: string } } {
  const active = Math.max(0, s.edgesAdded - s.edgesRevoked);
  return {
    tiles: [
      { label: "Agents", value: String(s.agents) },
      { label: "Edges", value: String(active), note: s.edgesRevoked ? `${s.edgesRevoked} revoked` : undefined },
      { label: "Memories written", value: String(s.memories) },
      { label: "Deliveries", value: String(s.propagations) },
    ],
    policy: s.violations === 0
      ? { ok: true, text: "0 deliveries without an active edge" }
      : { ok: false, text: `${s.violations} ${s.violations === 1 ? "delivery" : "deliveries"} without an active edge` },
  };
}
