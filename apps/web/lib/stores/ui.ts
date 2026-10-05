"use client";

import type { AgentId } from "@hive/shared";
import { create } from "zustand";
import type { BridgeStatus } from "@/lib/hive/types";

export type ToastItem = {
  id: string;
  status: "pending" | "success" | "revoked" | "error";
  message: string;
  link?: { href: string; label: string };
};

/** Canvas-relative position (px) where a popover opens. */
export type Anchor = { x: number; y: number };

type UiState = {
  drawerAgentId: AgentId | null;
  /** `topic` preselects a topic when editing an existing edge. */
  edgeEditor: { from: AgentId; to: AgentId; topic?: string } | null;
  edgeMenu: { key: string; at: Anchor } | null;
  revokeEdge: { key: string; at: Anchor } | null;
  zones: boolean;
  walletMenu: boolean;
  toasts: ToastItem[];
  bridge: BridgeStatus;
  set(patch: Partial<Omit<UiState, "set" | "toast" | "dismissToast" | "closeLayers">>): void;
  /** Esc closes any layer (design.md §10). Returns whether something was open. */
  closeLayers(): boolean;
  /** Success and revoked toasts auto-dismiss after 4 s; errors persist (design.md §8). Returns the toast id. */
  toast(t: Omit<ToastItem, "id"> & { id?: string }): string;
  dismissToast(id: string): void;
};

let toastSeq = 0;

export const useUi = create<UiState>()((set, get) => ({
  drawerAgentId: null,
  edgeEditor: null,
  edgeMenu: null,
  revokeEdge: null,
  zones: false,
  walletMenu: false,
  toasts: [],
  bridge: "connecting",
  set: (patch) => set(patch),
  closeLayers() {
    const s = get();
    // innermost first: confirm → menu → wallet → drawer
    if (s.revokeEdge) return set({ revokeEdge: null }), true;
    if (s.edgeMenu) return set({ edgeMenu: null }), true;
    if (s.walletMenu) return set({ walletMenu: false }), true;
    if (s.drawerAgentId !== null) return set({ drawerAgentId: null }), true;
    return false;
  },
  toast(t) {
    const id = t.id ?? `toast-${++toastSeq}`;
    set({ toasts: [...get().toasts.filter((x) => x.id !== id), { ...t, id }] });
    if (t.status === "success" || t.status === "revoked") setTimeout(() => get().dismissToast(id), 4000);
    return id;
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));
