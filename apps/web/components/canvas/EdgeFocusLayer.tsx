"use client";

import { ViewportPortal, useInternalNode, type InternalNode } from "@xyflow/react";
import type { KeyboardEvent } from "react";
import { useGraph, type EdgeView } from "@/lib/stores/graph";
import { expiresIn } from "@/lib/topics";

const center = (n: InternalNode) => ({
  x: n.internals.positionAbsolute.x + (n.measured.width ?? 0) / 2,
  y: n.internals.positionAbsolute.y + (n.measured.height ?? 0) / 2,
});

/**
 * Keyboard access to edges (design.md §10). React Flow draws edges before nodes, so its own edge focus would
 * come first in Tab order. These controls sit over each edge's label in the viewport portal, after the nodes:
 * Enter opens the edge menu, Delete opens the revoke confirm.
 */
function EdgeFocus({ edge, onOpen }: { edge: EdgeView; onOpen(key: string, el: HTMLElement, action: "menu" | "revoke"): void }) {
  const from = useInternalNode(edge.from.toString());
  const to = useInternalNode(edge.to.toString());
  const agents = useGraph((s) => s.agents);
  if (!from || !to || !from.measured.width || !to.measured.width) return null;
  const a = center(from);
  const b = center(to);
  const name = (id: bigint) => agents[id.toString()]?.name ?? `#${id}`;

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(edge.key, e.currentTarget, "menu"); }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); onOpen(edge.key, e.currentTarget, "revoke"); }
  }

  return (
    <button
      type="button"
      onKeyDown={onKeyDown}
      onClick={(e) => onOpen(edge.key, e.currentTarget, "menu")}
      aria-label={`Edge ${name(edge.from)} to ${name(edge.to)}, topic ${edge.topic}, ${expiresIn(edge.expiresAt)}. Enter for actions, Delete to revoke.`}
      className="pointer-events-none absolute h-[58px] w-[210px] rounded-sm opacity-0 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      style={{ transform: `translate(-50%, 0) translate(${(a.x + b.x) / 2}px, ${(a.y + b.y) / 2 + 18}px)` }}
    />
  );
}

export function EdgeFocusLayer({ edges, onOpen }: { edges: EdgeView[]; onOpen(key: string, el: HTMLElement, action: "menu" | "revoke"): void }) {
  return (
    <ViewportPortal>
      {edges.filter((e) => e.state === "signed").map((e) => <EdgeFocus key={e.key} edge={e} onOpen={onOpen} />)}
    </ViewportPortal>
  );
}
