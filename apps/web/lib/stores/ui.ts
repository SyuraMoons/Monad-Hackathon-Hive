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

type UiState = {
  drawerAgentId: AgentId | null;
  edgeEditor: { from: AgentId; to: AgentId } | null;
  revokeEdgeKey: string | null;
  zones: boolean;
  walletMenu: boolean;
  toasts: ToastItem[];
  bridge: BridgeStatus;
  set(patch: Partial<Omit<UiState, "set" | "toast" | "dismissToast">>): void;
  /** Success toasts auto-dismiss after 4 s; errors persist (design.md §8). Returns the toast id. */
  toast(t: Omit<ToastItem, "id"> & { id?: string }): string;
  dismissToast(id: string): void;
};

let toastSeq = 0;

export const useUi = create<UiState>()((set, get) => ({
  drawerAgentId: null,
  edgeEditor: null,
  revokeEdgeKey: null,
  zones: false,
  walletMenu: false,
  toasts: [],
  bridge: "connecting",
  set: (patch) => set(patch),
  toast(t) {
    const id = t.id ?? `toast-${++toastSeq}`;
    set({ toasts: [...get().toasts.filter((x) => x.id !== id), { ...t, id }] });
    if (t.status === "success" || t.status === "revoked") setTimeout(() => get().dismissToast(id), 4000);
    return id;
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));
