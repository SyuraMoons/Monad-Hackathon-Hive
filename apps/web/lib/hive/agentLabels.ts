import { z } from "zod";
import { MAX_AGENT_NAME } from "@/lib/hive/agentName";

// A label for an agent. The registry keeps the name it was registered with and has no rename, so the owner's label
// lives in this browser only (ADR-018). localStorage can be missing or full, so every access is guarded.

const keyFor = (owner: string) => `hive:agent-labels:${owner.toLowerCase()}`;

const zLabels = z.record(z.string().regex(/^(0|[1-9]\d*)$/), z.string().min(1).max(MAX_AGENT_NAME));

type Store = Pick<Storage, "getItem" | "setItem">;

function defaultStore(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The trimmed, single-spaced label, cut to the name limit. Empty means "no label". */
export const cleanLabel = (raw: string) => raw.trim().replace(/\s+/g, " ").slice(0, MAX_AGENT_NAME);

export function loadAgentLabels(owner: string, store: Store | null = defaultStore()): Record<string, string> {
  try {
    const raw = store?.getItem(keyFor(owner));
    const parsed = zLabels.safeParse(raw ? JSON.parse(raw) : {});
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export function saveAgentLabels(owner: string, labels: Record<string, string>, store: Store | null = defaultStore()): void {
  try {
    store?.setItem(keyFor(owner), JSON.stringify(labels));
  } catch {
    // private mode or quota: the label just goes away after a reload
  }
}
