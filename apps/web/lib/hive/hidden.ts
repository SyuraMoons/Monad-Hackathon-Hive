import { z } from "zod";

// Agents the owner removed from the canvas. The registry has no remove function, so this is a per-browser list of ids
// (ADR-012). The agents stay onchain. localStorage can be missing or full, so every access is guarded.

const keyFor = (owner: string) => `hive:hidden:${owner.toLowerCase()}`;

const zIds = z.array(z.string().regex(/^(0|[1-9]\d*)$/));

type Store = Pick<Storage, "getItem" | "setItem">;

function defaultStore(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadHidden(owner: string, store: Store | null = defaultStore()): string[] {
  try {
    const raw = store?.getItem(keyFor(owner));
    const parsed = zIds.safeParse(raw ? JSON.parse(raw) : []);
    return parsed.success ? [...new Set(parsed.data)] : [];
  } catch {
    return [];
  }
}

export function saveHidden(owner: string, ids: string[], store: Store | null = defaultStore()): void {
  try {
    store?.setItem(keyFor(owner), JSON.stringify([...new Set(ids)]));
  } catch {
    // private mode or quota: the agent just comes back after a reload
  }
}
