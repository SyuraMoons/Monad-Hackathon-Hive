"use client";

import { useCallback, useEffect, useState } from "react";

// Node x/y is the only canvas state that lives in the browser (rules §6, Canvas 0). Everything else
// comes back from chain and Envio. localStorage can be missing or full, so every access is guarded.
export type XY = { x: number; y: number };
export type Layout = Record<string, XY>;

const keyFor = (owner: string) => `hive:layout:${owner.toLowerCase()}`;

function read(owner: string): Layout {
  try {
    const raw = window.localStorage.getItem(keyFor(owner));
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return {};
    const out: Layout = {};
    for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
      const p = v as Partial<XY>;
      if (typeof p?.x === "number" && typeof p?.y === "number" && Number.isFinite(p.x) && Number.isFinite(p.y)) out[id] = { x: p.x, y: p.y };
    }
    return out;
  } catch {
    return {};
  }
}

function write(owner: string, layout: Layout) {
  try {
    window.localStorage.setItem(keyFor(owner), JSON.stringify(layout));
  } catch {
    // private mode or quota: positions just won't survive a reload
  }
}

export function useLayout(owner: string) {
  const [layout, setLayout] = useState<Layout>(() => read(owner));
  useEffect(() => setLayout(read(owner)), [owner]);

  /** Updates positions; `persist` writes them (on drop and drag end, not every drag frame). */
  const place = useCallback(
    (patch: Layout, persist = true) => {
      setLayout((prev) => {
        const next = { ...prev, ...patch };
        if (persist) write(owner, next);
        return next;
      });
    },
    [owner],
  );
  /** Takes an agent off the canvas: it keeps no position, so the sidebar shows it as unplaced. */
  const unplace = useCallback(
    (id: string) => {
      setLayout((prev) => {
        const { [id]: _gone, ...next } = prev;
        void _gone;
        write(owner, next);
        return next;
      });
    },
    [owner],
  );
  return { layout, place, unplace };
}
