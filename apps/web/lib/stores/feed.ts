"use client";

import type { AgentId, ContentHash, EdgeTopic, HiveEvent, SlotId, Topic, TxHash, UnixSeconds } from "@hive/shared";
import { create } from "zustand";
import { getHiveClient } from "@/lib/hive/client";
import { LockedError, type MemoryView } from "@/lib/hive/memoryView";
import type { MemoryHistoryRow } from "@/lib/hive/types";

export type FeedRow =
  | { kind: "written"; id: string; at: UnixSeconds; agentId: AgentId; topic: Topic; slotId: SlotId; contentHash: ContentHash; txHash: TxHash; propagatedTo: AgentId[] }
  | { kind: "read"; id: string; at: UnixSeconds; readerAgentId: AgentId; fromAgentIds: AgentId[]; count: number }
  | { kind: "edge-revoked"; id: string; at: UnixSeconds; from: AgentId; to: AgentId; topic: EdgeTopic; txHash: TxHash };

const MAX_ROWS = 200;

type FeedState = {
  rows: FeedRow[];
  /** Memories decrypted on this device, by content hash. "locked" until the passkey unlocks the keys, "error" if it couldn't be fetched or decrypted. */
  previews: Record<ContentHash, MemoryView | "error" | "locked" | "loading">;
  /** An agent's past writes from the chain, by agent id. Hashes and topics only. */
  history: Record<string, MemoryHistoryRow[] | "loading" | "error">;
  loadHistory(agentId: AgentId): Promise<void>;
  applyEvent(event: HiveEvent): void;
  push(row: FeedRow): void;
  loadPreview(hash: ContentHash): Promise<void>;
  /** Tries again every preview that was waiting for the keys. Call it after an unlock. */
  retryLocked(): void;
  reset(): void;
};

export const useFeed = create<FeedState>()((set, get) => ({
  rows: [],
  previews: {},
  history: {},

  async loadHistory(agentId) {
    const key = agentId.toString();
    if (get().history[key] === "loading") return;
    set({ history: { ...get().history, [key]: "loading" } });
    try {
      const rows = await (await getHiveClient()).memory.history(agentId);
      set({ history: { ...get().history, [key]: rows } });
    } catch {
      set({ history: { ...get().history, [key]: "error" } });
    }
  },

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
    await fetchPreview(hash);
  },

  retryLocked() {
    for (const [hash, p] of Object.entries(get().previews)) if (p === "locked") void fetchPreview(hash as ContentHash);
  },

  reset() {
    generation++;
    set({ rows: [], previews: {}, history: {} });
  },
}));

/** Bumped by reset(), so a decrypt that finishes after sign-out can't put plaintext back. */
let generation = 0;

/** Fetches and decrypts one memory whatever its state, so a locked one can be tried again. */
async function fetchPreview(hash: ContentHash) {
  const { getState, setState } = useFeed;
  const started = generation;
  const put = (p: FeedState["previews"][ContentHash]) => started === generation && setState({ previews: { ...getState().previews, [hash]: p } });
  put("loading");
  try {
    put(await (await getHiveClient()).memory.preview(hash));
  } catch (e) {
    put(e instanceof LockedError ? "locked" : "error");
  }
}
