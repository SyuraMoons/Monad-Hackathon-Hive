"use client";

import "@xyflow/react/dist/base.css";
import "./canvas.css";

import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  useReactFlow,
  type NodeChange,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { signEdge } from "@/lib/edgeActions";
import type { Layout, XY } from "@/lib/layout";
import { GHOST_MS, useGraph } from "@/lib/stores/graph";
import { useUi, type Anchor } from "@/lib/stores/ui";
import { AgentNode, type AgentFlowNode } from "./AgentNode";
import { EdgeEditorModal } from "./EdgeEditorModal";
import { EdgeFocusLayer } from "./EdgeFocusLayer";
import { EdgeMenu } from "./EdgeMenu";
import { HiveEdge, type HiveFlowEdge } from "./HiveEdge";
import { PulseLayer } from "./PulseLayer";
import { RevokeConfirm } from "./RevokeConfirm";
import { computeZones, ZoneLayer } from "./ZoneLayer";

export const AGENT_MIME = "application/x-hive-agent";

const nodeTypes = { agent: AgentNode };
const edgeTypes = { hive: HiveEdge };

// First slots match Figma Canvas 1 Live (55:46) at zoom 1; beyond that, a grid.
const SLOTS: XY[] = [{ x: 130, y: 260 }, { x: 600, y: 260 }, { x: 130, y: 540 }, { x: 600, y: 540 }, { x: 365, y: 110 }, { x: 365, y: 680 }];
export function freeSlot(taken: XY[], index: number, total: number): XY {
  const grid = (i: number) => ({ x: 40 + (i % 4) * 250, y: 60 + Math.floor(i / 4) * 170 });
  const candidates = total > SLOTS.length ? Array.from({ length: total + 8 }, (_, i) => grid(i)) : [...SLOTS, ...Array.from({ length: 8 }, (_, i) => grid(i + 8))];
  const free = candidates.filter((c) => !taken.some((t) => Math.abs(t.x - c.x) < 120 && Math.abs(t.y - c.y) < 60));
  return free[0] ?? grid(index + total);
}

export function GraphCanvas({ layout, place }: { layout: Layout; place(patch: Layout, persist?: boolean): void }) {
  const status = useGraph((s) => s.status);
  const agents = useGraph((s) => s.agents);
  const edges = useGraph((s) => s.edges);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const rf = useReactFlow();
  const canvasRef = useRef<HTMLDivElement>(null);
  const connectEndedAt = useRef(0);
  const editor = useUi((s) => s.edgeEditor);
  const edgeMenu = useUi((s) => s.edgeMenu);
  const revoke = useUi((s) => s.revokeEdge);
  const zonesOn = useUi((s) => s.zones);
  const setUi = useUi((s) => s.set);

  /** A popover anchor inside the canvas, kept on screen. */
  const anchor = useCallback((clientX: number, clientY: number, w = 400, h = 320): Anchor => {
    const r = canvasRef.current?.getBoundingClientRect();
    if (!r) return { x: 16, y: 16 };
    return { x: Math.min(Math.max(16, clientX - r.left), r.width - w - 16), y: Math.min(Math.max(16, clientY - r.top), r.height - h - 16) };
  }, []);

  // Revoked edges stay for GHOST_MS as a fading ghost (Canvas 4 Revoked, 61:260).
  const drawnEdges = useMemo(
    () => Object.values(edges).filter((e) => e.state !== "revoked" || (e.revokedAt && Date.now() - e.revokedAt < GHOST_MS + 200)),
    [edges],
  );
  // Only confirmed edges make a node non-isolated: a pending edge must not look final (golden rule 6).
  const confirmed = useMemo(() => drawnEdges.filter((e) => e.state === "signed" || e.state === "revoking"), [drawnEdges]);
  const linked = useMemo(() => new Set(confirmed.flatMap((e) => [e.from.toString(), e.to.toString()])), [confirmed]);

  // A new browser has no saved layout: give every agent that has an edge a position, so the graph from chain
  // shows up (rules T9). Agents without edges stay as chips until they're dropped.
  useEffect(() => {
    if (status !== "ready") return;
    const missing = Object.keys(agents).filter((id) => linked.has(id) && !layout[id]).sort((a, b) => Number(a) - Number(b));
    if (!missing.length) return;
    const taken = Object.values(layout);
    const patch: Layout = {};
    missing.forEach((id, i) => {
      patch[id] = freeSlot([...taken, ...Object.values(patch)], i, Object.keys(agents).length);
    });
    place(patch);
  }, [status, agents, linked, layout, place]);

  const placedIds = useMemo(() => Object.keys(agents).filter((id) => layout[id]), [agents, layout]);

  const nodes: AgentFlowNode[] = useMemo(
    () => placedIds.map((id) => ({ id, type: "agent", position: layout[id], data: { agentId: id, isolated: !linked.has(id) }, selected: id === selected })),
    [placedIds, layout, linked, selected],
  );

  const flowEdges: HiveFlowEdge[] = useMemo(
    () =>
      drawnEdges
        .filter((e) => layout[e.from.toString()] && layout[e.to.toString()])
        .map((e) => ({ id: e.key, source: e.from.toString(), target: e.to.toString(), type: "hive", data: { edgeKey: e.key }, focusable: false })),
    [drawnEdges, layout],
  );

  const zones = useMemo(
    () =>
      zonesOn
        ? computeZones(
            placedIds,
            confirmed.map((e) => ({ from: e.from.toString(), to: e.to.toString(), topic: e.topic })),
            (id) => agents[id]?.name ?? `#${id}`,
          )
        : [],
    [zonesOn, placedIds, confirmed, agents],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<AgentFlowNode>[]) => {
      for (const c of changes) {
        if (c.type === "position" && c.position) place({ [c.id]: c.position }, !c.dragging);
        if (c.type === "select") setSelected((cur) => (c.selected ? c.id : cur === c.id ? null : cur));
      }
    },
    [place],
  );

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const id = e.dataTransfer.getData(AGENT_MIME);
    if (!id || !agents[id]) return;
    const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    place({ [id]: { x: Math.round(p.x - 110), y: Math.round(p.y - 36) } });
  }

  // Enter on a focused node opens its drawer (design.md §10).
  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== "Enter") return;
    const node = (e.target as HTMLElement).closest<HTMLElement>(".react-flow__node");
    const id = node?.getAttribute("data-id");
    if (id && agents[id]) {
      e.preventDefault();
      setUi({ drawerAgentId: agents[id].agentId, edgeMenu: null, revokeEdge: null });
    }
  }

  function openEdge(key: string, el: HTMLElement, action: "menu" | "revoke") {
    const r = el.getBoundingClientRect();
    if (action === "menu") setUi({ edgeMenu: { key, at: anchor(r.left, r.bottom + 6, 240, 130) }, revokeEdge: null });
    else setUi({ revokeEdge: { key, at: anchor(r.left, r.bottom + 6) }, edgeMenu: null });
  }

  const empty = status === "ready" && nodes.length === 0;
  const hasEdges = confirmed.some((e) => layout[e.from.toString()] && layout[e.to.toString()]);

  return (
    <div
      ref={canvasRef}
      data-hive-canvas
      tabIndex={-1}
      className="relative h-full min-h-0 focus:outline-none"
      onKeyDown={onKeyDown}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(AGENT_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOver(true);
      }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
      onDrop={onDrop}
    >
      <ReactFlow
        className="hive-flow"
        nodes={nodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, n) => {
          // Finishing a drag-to-connect over a node also fires a click; that should open the editor, not the drawer.
          if (Date.now() - connectEndedAt.current < 400) return;
          if (agents[n.id]) setUi({ drawerAgentId: agents[n.id].agentId, edgeMenu: null, revokeEdge: null });
        }}
        onConnectEnd={() => { connectEndedAt.current = Date.now(); }}
        onPaneClick={() => {
          setSelected(null);
          setUi({ drawerAgentId: null, edgeMenu: null, revokeEdge: null });
        }}
        onEdgeContextMenu={(e, edge) => {
          e.preventDefault();
          if (useGraph.getState().edges[edge.id]?.state === "signed") setUi({ edgeMenu: { key: edge.id, at: anchor(e.clientX, e.clientY, 240, 130) }, revokeEdge: null });
        }}
        onConnect={({ source, target }) => {
          if (source && target && source !== target) setUi({ edgeEditor: { from: BigInt(source), to: BigInt(target) } });
        }}
        isValidConnection={({ source, target }) => source !== target}
        connectionLineStyle={{ stroke: "var(--color-ink-3)", strokeWidth: 1.5, strokeDasharray: "4 4" }}
        // Delete opens the revoke confirm instead of deleting locally; edges get focus from EdgeFocusLayer.
        deleteKeyCode={null}
        edgesFocusable={false}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        minZoom={0.4}
        maxZoom={1.75}
        proOptions={{ hideAttribution: true }}
        aria-label="Permission graph"
      >
        <Background variant={BackgroundVariant.Lines} gap={40} color="var(--color-line)" lineWidth={1} />
        {zonesOn && <ZoneLayer zones={zones} layout={layout} />}
        <Controls showInteractive={false} position="bottom-left" style={{ left: 20, bottom: 20 }} />
        <PulseLayer />
        <EdgeFocusLayer edges={confirmed.filter((e) => layout[e.from.toString()] && layout[e.to.toString()])} onOpen={openEdge} />
      </ReactFlow>

      {empty && (
        <div
          className={cn(
            "pointer-events-none absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2.5 rounded-modal border border-dashed bg-paper px-10 py-9 text-center transition-colors",
            dragOver ? "border-amber-strong" : "border-clay",
          )}
        >
          <p className="font-display text-[30px] leading-tight text-ink">Drag your first agent here</p>
          <p className="w-[380px] max-w-full text-[16px] leading-[1.5] text-ink-2">
            Pick an agent from the left. Its identity is already onchain; placing it here only sets where it sits.
          </p>
        </div>
      )}

      <p className="pointer-events-none absolute right-0 bottom-6 left-0 text-center font-mono text-[14px] whitespace-pre text-ink-3">
        {zonesOn && zones.length
          ? `${zones.length} ${zones.length === 1 ? "zone" : "zones"}  ·  no edge crosses between them`
          : empty || !hasEdges
            ? "Nothing is connected yet, so nothing can leak."
            : "Drag between two agents to draw an edge  ·  right-click an edge to revoke"}
      </p>

      {edgeMenu && <EdgeMenu edgeKey={edgeMenu.key} at={edgeMenu.at} />}
      {revoke && <RevokeConfirm edgeKey={revoke.key} at={revoke.at} />}
      {editor && (
        <EdgeEditorModal
          key={`${editor.from}-${editor.to}-${editor.topic ?? ""}`}
          from={editor.from}
          to={editor.to}
          initialTopic={editor.topic}
          onClose={() => setUi({ edgeEditor: null })}
          onSign={(d) => void signEdge(d)}
          returnFocus={canvasRef}
        />
      )}
    </div>
  );
}
