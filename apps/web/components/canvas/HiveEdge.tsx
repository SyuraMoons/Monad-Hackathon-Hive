"use client";

import { EdgeLabelRenderer, useInternalNode, type Edge, type EdgeProps, type InternalNode } from "@xyflow/react";
import { memo } from "react";
import { hasReverse, labelTransform, lineShift } from "@/lib/edgeGeometry";
import { shortHash } from "@/lib/format";
import { explorerTx } from "@/lib/explorer";
import { useGraph } from "@/lib/stores/graph";
import { expiresIn, topicColor, topicLabel } from "@/lib/topics";

export type HiveEdgeData = { edgeKey: string };
export type HiveFlowEdge = Edge<HiveEdgeData, "hive">;

/** DOM id of an edge's path, so the pulse layer can follow it with getPointAtLength. */
export const edgePathId = (edgeKey: string) => `hive-edge-path-${edgeKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

type Pt = { x: number; y: number };

function center(n: InternalNode): Pt {
  const p = n.internals.positionAbsolute;
  return { x: p.x + (n.measured.width ?? 0) / 2, y: p.y + (n.measured.height ?? 0) / 2 };
}

/** Where the line from `n`'s centre towards `toward` crosses `n`'s border (floating edges). */
function borderPoint(n: InternalNode, toward: Pt): Pt {
  const w = (n.measured.width ?? 0) / 2;
  const h = (n.measured.height ?? 0) / 2;
  const c = center(n);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (!dx && !dy) return c;
  const scale = 1 / Math.max(Math.abs(dx) / w, Math.abs(dy) / h);
  return { x: c.x + dx * scale, y: c.y + dy * scale };
}

// Pending: 1.5px dashed ink-3 · Signed: 2px solid topic colour with an arrowhead · Hover: 3px (design.md §6).
// Edges float: they run straight between the facing borders of the two nodes, wherever those are.
function HiveEdgeImpl({ data, source, target }: EdgeProps<HiveFlowEdge>) {
  const edge = useGraph((s) => (data ? s.edges[data.edgeKey] : undefined));
  const from = useInternalNode(source);
  const to = useInternalNode(target);
  // A → B with a live B → A is drawn as a pair: two parallel arrows, each with its own label.
  const pair = useGraph((s) => (edge ? hasReverse(Object.values(s.edges), edge) : false));
  if (!edge || !data || !from || !to || !from.measured.width || !to.measured.width) return null;

  const a = borderPoint(from, center(to));
  const bRaw = borderPoint(to, center(from));
  // stop a few px short of the border so the arrowhead's tip touches it
  const len = Math.hypot(bRaw.x - a.x, bRaw.y - a.y) || 1;
  const b = { x: bRaw.x - ((bRaw.x - a.x) / len) * 3, y: bRaw.y - ((bRaw.y - a.y) / len) * 3 };
  const shift = lineShift(a, b, pair);
  const path = `M ${a.x + shift.x},${a.y + shift.y} L ${b.x + shift.x},${b.y + shift.y}`;

  const pending = edge.state === "pending";
  const ghost = edge.state === "revoked";
  const color = ghost ? "var(--color-status-revoked)" : pending ? "var(--color-ink-3)" : topicColor(edge.topic);
  const markerId = `${edgePathId(data.edgeKey)}-arrow`;
  const txHash = ghost ? edge.removedTx : edge.addedTx;

  if (ghost) {
    // Revoked ghost: dashed status-revoked at 45%, fading to 0 over 3 s (design.md §6 Edge, §8).
    return (
      <>
        <g className="hive-ghost" style={{ color }}>
          <path d={path} fill="none" stroke="currentColor" strokeWidth={2} strokeDasharray="4 4" />
        </g>
        <EdgeLabelRenderer>
          <div
            className="hive-ghost-label pointer-events-none absolute rounded-sm border border-status-revoked bg-paper px-2.5 py-[5px] font-mono text-[14px] whitespace-pre text-status-revoked"
            style={{ transform: labelTransform(a, b, pair, 20) }}
          >
            revoked {edge.revokedAt ? new Date(edge.revokedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : ""}
            {txHash ? `  ·  tx ${shortHash(txHash)}` : ""}
          </div>
        </EdgeLabelRenderer>
      </>
    );
  }

  return (
    <>
      <g className="hive-edge" style={{ color }}>
        <defs>
          <marker id={markerId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="10" markerHeight="10" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
            <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
          </marker>
        </defs>
        {/* wide invisible hit area for hover and (step 8) right-click */}
        <path d={path} fill="none" stroke="transparent" strokeWidth={16} className="react-flow__edge-interaction" />
        <path
          id={edgePathId(data.edgeKey)}
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth={pending ? 1.5 : 2}
          strokeDasharray={pending ? "4 4" : undefined}
          markerEnd={pending ? undefined : `url(#${markerId})`}
          className="hive-edge-path transition-[stroke-width] duration-250"
        />
      </g>
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-auto absolute flex flex-col items-center gap-1 rounded-sm border bg-paper px-2.5 py-1.5 text-[14px] leading-none"
          style={{ transform: labelTransform(a, b, pair, 22), borderColor: color }}
        >
          <span className="font-mono font-medium whitespace-pre text-ink">
            {topicLabel(edge.topic)}  ·  {pending ? "pending" : edge.state === "revoking" ? "revoking…" : expiresIn(edge.expiresAt)}
          </span>
          {txHash && !pending && (
            <a
              href={explorerTx(txHash)}
              target="_blank"
              rel="noreferrer"
              aria-label={`View edge transaction ${shortHash(txHash)} on Monadscan`}
              tabIndex={-1} // keyboard users reach it through the edge menu, so Tab stays nodes → edges (design.md §10)
              className="font-mono whitespace-pre text-ink-2 underline underline-offset-2 hover:text-ink"
            >
              tx {shortHash(txHash)}  ↗
            </a>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const HiveEdge = memo(HiveEdgeImpl);
