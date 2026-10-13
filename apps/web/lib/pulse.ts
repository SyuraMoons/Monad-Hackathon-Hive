import { ALL_TOPICS, type HiveEvent } from "@hive/shared";

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

type PulseEdge = { from: bigint; to: bigint; topic: string; state: string };

/** The signed edge a pulse travels on: one for exactly this topic, else the all-topics edge (ADR-013). */
export function findPulseEdge<E extends PulseEdge>(edges: E[], { from, to, topic }: Pulse): E | undefined {
  const live = edges.filter((e) => e.state === "signed" && e.from.toString() === from && e.to.toString() === to);
  return live.find((e) => e.topic === topic) ?? live.find((e) => e.topic === ALL_TOPICS);
}
