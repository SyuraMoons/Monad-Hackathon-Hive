import type { HiveEventWire } from "@hive/shared";

// Events for GET /v1/events. Payloads carry ids and hashes only, never memory content.

export type BusEvent = HiveEventWire;
type Draft = { [T in BusEvent["type"]]: Omit<Extract<BusEvent, { type: T }>, "id" | "at"> }[BusEvent["type"]];

type Listener = (event: BusEvent) => void;

const REPLAY = 100;

/** In-memory fan-out per owner, with a short ring buffer so `Last-Event-ID` can resume after a dropped connection. */
export class EventBus {
  private seq = 0;
  private listeners = new Map<string, Set<Listener>>();
  private history = new Map<string, { n: number; event: BusEvent }[]>();

  constructor(private now: () => number = () => Math.floor(Date.now() / 1000)) {}

  publish(owner: string, draft: Draft): void {
    const n = ++this.seq;
    const event = { id: String(n), at: this.now(), ...draft } as BusEvent;
    const key = owner.toLowerCase();
    const rows = this.history.get(key) ?? [];
    rows.push({ n, event });
    if (rows.length > REPLAY) rows.shift();
    this.history.set(key, rows);
    for (const l of this.listeners.get(key) ?? []) l(event);
  }

  /** Delivers events after `lastEventId` first, then live ones. Returns the unsubscribe function. */
  subscribe(owner: string, listener: Listener, lastEventId?: string): () => void {
    const key = owner.toLowerCase();
    const after = Number(lastEventId);
    if (Number.isInteger(after) && after >= 0) {
      for (const row of this.history.get(key) ?? []) if (row.n > after) listener(row.event);
    }
    const set = this.listeners.get(key) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(key, set);
    return () => void set.delete(listener);
  }
}
