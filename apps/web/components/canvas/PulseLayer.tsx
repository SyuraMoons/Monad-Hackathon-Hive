"use client";

import { ViewportPortal } from "@xyflow/react";
import { useEffect, useRef } from "react";
import { findPulseEdge, pulses, type Pulse } from "@/lib/pulse";
import { useGraph } from "@/lib/stores/graph";
import { topicColor } from "@/lib/topics";
import { edgePathId } from "./HiveEdge";

const DURATION = 600; // design.md §8: 600 ms ease-out
const SVG = "http://www.w3.org/2000/svg";
const easeOut = (t: number) => 1 - (1 - t) ** 3;

type Running = { path: SVGPathElement; length: number; start: number; dot: SVGCircleElement; glow: SVGCircleElement; to: string };

/** Briefly marks the target node: the arrival flash, or the whole effect with reduced motion. */
function flash(agentId: string, ms: number, cls = "hive-hit") {
  const el = document.querySelector<HTMLElement>(`[data-agent-node="${CSS.escape(agentId)}"] .hive-node`);
  if (!el) return;
  el.classList.add(cls);
  window.setTimeout(() => el.classList.remove(cls), ms);
}

/**
 * Pulses travel along edge paths in flow coordinates. One requestAnimationFrame loop moves SVG circles
 * directly (no React state per frame), and it only runs while at least one pulse is in flight.
 */
export function PulseLayer() {
  const layer = useRef<SVGGElement>(null);

  useEffect(() => {
    const running: Running[] = [];
    let raf = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

    function frame(now: number) {
      for (let i = running.length - 1; i >= 0; i--) {
        const p = running[i];
        const t = Math.min(1, (now - p.start) / DURATION);
        const pt = p.path.getPointAtLength(p.length * easeOut(t));
        p.dot.setAttribute("cx", String(pt.x));
        p.dot.setAttribute("cy", String(pt.y));
        p.glow.setAttribute("cx", String(pt.x));
        p.glow.setAttribute("cy", String(pt.y));
        if (t >= 1) {
          p.dot.remove();
          p.glow.remove();
          running.splice(i, 1);
          flash(p.to, 400);
        }
      }
      raf = running.length ? requestAnimationFrame(frame) : 0;
    }

    function start({ from, to, topic }: Pulse) {
      const edge = findPulseEdge(Object.values(useGraph.getState().edges), { from, to, topic });
      if (!edge) return;
      if (reduce.matches) return flash(to, 150);
      const path = document.getElementById(edgePathId(edge.key)) as SVGPathElement | null;
      const g = layer.current;
      if (!path || !g) return;

      flash(from, 300, "hive-send");
      const color = topicColor(topic);
      const glow = document.createElementNS(SVG, "circle");
      glow.setAttribute("r", "14");
      glow.style.fill = color;
      glow.style.opacity = "0.22";
      const dot = document.createElementNS(SVG, "circle");
      dot.setAttribute("r", "6");
      dot.style.fill = color;
      g.append(glow, dot);
      running.push({ path, length: path.getTotalLength(), start: performance.now(), dot, glow, to });
      if (!raf) raf = requestAnimationFrame(frame);
    }

    const off = pulses.subscribe(start);
    return () => {
      off();
      cancelAnimationFrame(raf);
      running.forEach((p) => { p.dot.remove(); p.glow.remove(); });
    };
  }, []);

  return (
    <ViewportPortal>
      <svg className="pointer-events-none absolute top-0 left-0 overflow-visible" width="1" height="1" aria-hidden="true">
        <g ref={layer} />
      </svg>
    </ViewportPortal>
  );
}
