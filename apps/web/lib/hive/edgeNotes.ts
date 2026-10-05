import { z } from "zod";

// The chain keeps only keccak256(topic) for an edge and no transaction hash, so this browser remembers the topic and the
// transaction of the edges it signed. Per owner, localStorage can be missing or full, so every access is guarded.

export type EdgeNote = { topic: string; addedTx: string };

const keyFor = (owner: string) => `hive:edges:${owner.toLowerCase()}`;

const zNotes = z.record(z.string().regex(/^[1-9]\d*$/), z.object({ topic: z.string().regex(/^[a-z0-9-]{1,31}$/), addedTx: z.string().regex(/^0x[0-9a-fA-F]{64}$/) }));

type Store = Pick<Storage, "getItem" | "setItem">;

function defaultStore(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadEdgeNotes(owner: string, store: Store | null = defaultStore()): Record<string, EdgeNote> {
  try {
    const raw = store?.getItem(keyFor(owner));
    const parsed = zNotes.safeParse(raw ? JSON.parse(raw) : {});
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export function saveEdgeNote(owner: string, edgeId: string, note: EdgeNote, store: Store | null = defaultStore()): void {
  try {
    store?.setItem(keyFor(owner), JSON.stringify({ ...loadEdgeNotes(owner, store), [edgeId]: note }));
  } catch {
    // private mode or quota: the edge then shows its transaction as unknown after a reload
  }
}
