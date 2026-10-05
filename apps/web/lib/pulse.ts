import type { HiveEvent } from "@hive/shared";

// memory.written → canvas pulses, outside React state so an animation never causes a render (step 6).
export type Pulse = { from: string; to: string; topic: string };
type Listener = (p: Pulse) => void;

const listeners = new Set<Listener>();

export const pulses = {
  subscribe(l: Listener) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
  /** One pulse per propagatedTo target (SRD NL-7). */
  fromEvent(event: HiveEvent) {
    if (event.type !== "memory.written") return;
    const from = event.data.agentId.toString();
    for (const to of event.data.propagatedTo) listeners.forEach((l) => l({ from, to: to.toString(), topic: event.data.topic }));
  },
};
