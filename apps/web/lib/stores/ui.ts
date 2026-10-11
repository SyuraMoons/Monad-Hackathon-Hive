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

/** What the open agent drawer shows: the agent, its whole memory history, or one memory (and where it was opened from). */
export type DrawerView = "agent" | "history" | { slotId: string; from: "agent" | "history" };

/** Canvas-relative position (px) where a popover opens. */
export type Anchor = { x: number; y: number };

type UiState = {
  drawerAgentId: AgentId | null;
  drawerView: DrawerView;
  /** `topic` preselects a topic when editing an existing edge. */
  edgeEditor: { from: AgentId; to: AgentId; topic?: string } | null;
  edgeMenu: { key: string; at: Anchor } | null;
  revokeEdge: { key: string; at: Anchor } | null;
  /** Right-click menu of a sidebar agent chip. `at` is viewport-relative (the menu is fixed). */
  agentMenu: { agentId: string; at: Anchor } | null;
  hideAgent: { agentId: string; at: Anchor } | null;
  /** The "New agent" modal on the canvas. */
  newAgent: boolean;
  /** The "Connect to Claude" modal, for this agent. */
  connectAgent: AgentId | null;
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
  drawerView: "agent",
  edgeEditor: null,
  edgeMenu: null,
  revokeEdge: null,
  agentMenu: null,
  hideAgent: null,
  newAgent: false,
  connectAgent: null,
  zones: false,
  walletMenu: false,
  toasts: [],
  bridge: "connecting",
  set: (patch) => set(patch),
  closeLayers() {
    const s = get();
    // innermost first: confirm → menu → wallet → drawer view → drawer
    if (s.hideAgent) return set({ hideAgent: null }), true;
    if (s.agentMenu) return set({ agentMenu: null }), true;
    if (s.revokeEdge) return set({ revokeEdge: null }), true;
    if (s.edgeMenu) return set({ edgeMenu: null }), true;
    if (s.walletMenu) return set({ walletMenu: false }), true;
    if (s.drawerAgentId !== null && s.drawerView !== "agent") return set({ drawerView: s.drawerView === "history" ? "agent" : s.drawerView.from }), true;
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
