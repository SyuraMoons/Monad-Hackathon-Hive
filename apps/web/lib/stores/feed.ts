"use client";

import type { AgentId, ContentHash, HiveEvent, SlotId, Topic, TxHash, UnixSeconds } from "@hive/shared";
import { create } from "zustand";
import { getHiveClient } from "@/lib/hive/client";

export type FeedRow =
  | { kind: "written"; id: string; at: UnixSeconds; agentId: AgentId; topic: Topic; slotId: SlotId; contentHash: ContentHash; txHash: TxHash; propagatedTo: AgentId[] }
  | { kind: "read"; id: string; at: UnixSeconds; readerAgentId: AgentId; fromAgentIds: AgentId[]; count: number }
  | { kind: "edge-revoked"; id: string; at: UnixSeconds; from: AgentId; to: AgentId; topic: Topic; txHash: TxHash };

const MAX_ROWS = 200;

type FeedState = {
  rows: FeedRow[];
  /** Plaintext decrypted on this device, by content hash. "error" if it couldn't be fetched or decrypted. */
  previews: Record<ContentHash, string | "error" | "loading">;
  applyEvent(event: HiveEvent): void;
  push(row: FeedRow): void;
  loadPreview(hash: ContentHash): Promise<void>;
  reset(): void;
};

export const useFeed = create<FeedState>()((set, get) => ({
  rows: [],
  previews: {},

  applyEvent(event) {
    if (event.type === "memory.written") {
      get().push({ kind: "written", id: event.id, at: event.at, ...event.data });
      void get().loadPreview(event.data.contentHash);
    } else if (event.type === "memory.read") {
      get().push({ kind: "read", id: event.id, at: event.at, ...event.data });
    }
  },

  push(row) {
    if (get().rows.some((r) => r.id === row.id)) return;
    const rows = [row, ...get().rows].sort((a, b) => b.at - a.at).slice(0, MAX_ROWS);
    set({ rows });
  },

  async loadPreview(hash) {
    if (get().previews[hash]) return;
    set({ previews: { ...get().previews, [hash]: "loading" } });
    try {
      const text = await (await getHiveClient()).memory.preview(hash);
      set({ previews: { ...get().previews, [hash]: text } });
    } catch {
      set({ previews: { ...get().previews, [hash]: "error" } });
    }
  },

  reset() {
    set({ rows: [], previews: {} });
  },
}));
