"use client";

import { EdgeLabelRenderer, getStraightPath, type Edge, type EdgeProps } from "@xyflow/react";
import { memo } from "react";
import { cn } from "@/lib/cn";
import { shortHash } from "@/lib/format";
import { explorerTx } from "@/lib/explorer";
import { useGraph } from "@/lib/stores/graph";
import { expiresIn, topicColor } from "@/lib/topics";

export type HiveEdgeData = { edgeKey: string };
export type HiveFlowEdge = Edge<HiveEdgeData, "hive">;

/** DOM id of an edge's path, so the pulse layer can follow it with getPointAtLength. */
export const edgePathId = (edgeKey: string) => `hive-edge-path-${edgeKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

// Pending: 1.5px dashed ink-3 · Signed: 2px solid topic colour with an arrowhead · Hover: 3px (design.md §6).
function HiveEdgeImpl({ data, sourceX, sourceY, targetX, targetY }: EdgeProps<HiveFlowEdge>) {
  const edge = useGraph((s) => (data ? s.edges[data.edgeKey] : undefined));
  if (!edge || !data) return null;

  const pending = edge.state === "pending";
  const color = pending ? "var(--color-ink-3)" : topicColor(edge.topic);
  const [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX: targetX - 6, targetY });
  const markerId = `${edgePathId(data.edgeKey)}-arrow`;
  const txHash = edge.addedTx;

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
          style={{ transform: `translate(-50%, 0) translate(${labelX}px, ${labelY + 22}px)`, borderColor: color }}
        >
          <span className="font-mono font-medium whitespace-pre text-ink">
            {edge.topic}  ·  {pending ? "pending" : expiresIn(edge.expiresAt)}
          </span>
          {txHash && !pending && (
            <a
              href={explorerTx(txHash)}
              target="_blank"
              rel="noreferrer"
              aria-label={`View edge transaction ${shortHash(txHash)} on Monadscan`}
              className={cn("font-mono whitespace-pre text-ink-2 underline underline-offset-2 hover:text-ink")}
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
