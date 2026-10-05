import { zAddress, type Address } from "@hive/shared";
import { z } from "zod";

// The user token lives 24 h (bridge USER_TOKEN_TTL_S), so it is kept in localStorage to survive a reload (ADR-011).
// Keys are never stored: they are derived from the passkey again when an action needs them.

const KEY = "hive:session";

const zSaved = z.object({ owner: zAddress, userToken: z.string().min(1), expiresAt: z.number().int(), credentialId: z.string().min(1) });
export type SavedSession = { owner: Address; userToken: string; expiresAt: number; credentialId: string };

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** localStorage can be missing (SSR, private mode) or throw, so every access is guarded. */
function defaultStore(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function saveSession(session: SavedSession, store: Store | null = defaultStore()): void {
  try {
    store?.setItem(KEY, JSON.stringify(session));
  } catch {
    // quota or private mode: the session just won't survive a reload
  }
}

export function clearSavedSession(store: Store | null = defaultStore()): void {
  try {
    store?.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}

/** The saved session, or null when there is none, it is malformed or it has expired (and then it is removed). */
export function loadSavedSession(nowS: number, store: Store | null = defaultStore()): SavedSession | null {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return null;
    const parsed = zSaved.safeParse(JSON.parse(raw));
    if (parsed.success && parsed.data.expiresAt > nowS) return parsed.data as SavedSession;
  } catch {
    // fall through: unreadable
  }
  clearSavedSession(store);
  return null;
}
