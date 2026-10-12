"use client";

import { useViewport } from "@xyflow/react";
import type { Layout } from "@/lib/layout";
import { topicColor } from "@/lib/topics";

export type Zone = { ids: string[]; topics: string[]; names: string[]; sealed: boolean };

const NODE = { w: 220, h: 73 };
const PAD = { x: 30, top: 56, bottom: 60 };

/**
 * Connected components of the confirmed edge graph (Canvas 6, 61:750). Computed on the client; no backend.
 * An agent with no edge is its own sealed zone.
 */
export function computeZones(ids: string[], edges: { from: string; to: string; topic: string }[], nameOf: (id: string) => string): Zone[] {
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
  for (const e of edges) if (parent.has(e.from) && parent.has(e.to)) parent.set(find(e.from), find(e.to));
  const groups = new Map<string, string[]>();
  for (const id of ids) groups.set(find(id), [...(groups.get(find(id)) ?? []), id]);
  return [...groups.values()]
    .map((g) => {
      const topics = [...new Set(edges.filter((e) => g.includes(e.from) && g.includes(e.to)).map((e) => e.topic))].sort();
      return { ids: g, topics, names: g.map(nameOf), sealed: topics.length === 0 };
    })
    .sort((a, b) => Number(a.sealed) - Number(b.sealed) || Number(a.ids[0]) - Number(b.ids[0]));
}

// Rendered right after <Background> at z-index -1: above the grid, under edges, labels and nodes.
export function ZoneLayer({ zones, layout }: { zones: Zone[]; layout: Layout }) {
  const { x: vx, y: vy, zoom } = useViewport();
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ zIndex: -1 }}>
      <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `translate(${vx}px, ${vy}px) scale(${zoom})` }}>
      {zones.map((z, i) => {
        const pts = z.ids.map((id) => layout[id]).filter(Boolean);
        if (!pts.length) return null;
        const x = Math.min(...pts.map((p) => p.x)) - PAD.x;
        const y = Math.min(...pts.map((p) => p.y)) - PAD.top;
        const w = Math.max(...pts.map((p) => p.x)) + NODE.w + PAD.x - x;
        const h = Math.max(...pts.map((p) => p.y)) + NODE.h + PAD.bottom - y;
        const color = z.sealed ? "var(--color-clay)" : topicColor(z.topics[0]);
        return (
          <div key={z.ids.join("-")} aria-hidden="true" className="absolute" style={{ transform: `translate(${x}px, ${y}px)`, width: w, height: h }}>
            <div
              className="hive-zone absolute inset-0"
              style={{ borderColor: `color-mix(in srgb, ${color} 55%, transparent)`, background: `color-mix(in srgb, ${color} 7%, transparent)` }}
            />
            {/* Zone labels stay ink-2: topic colours fail AA at 14px. */}
            <p className="absolute top-3.5 left-5 font-mono text-[14px] tracking-[0.1em] whitespace-pre text-ink-2">
              ZONE {i + 1}  ·  {z.sealed ? "sealed" : `${z.topics.join(", ")}  ·  ${z.names.join(", ")}`}
            </p>
          </div>
        );
      })}
      </div>
    </div>
  );
}
