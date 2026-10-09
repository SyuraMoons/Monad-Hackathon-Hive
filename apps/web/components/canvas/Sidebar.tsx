"use client";

import { useReactFlow } from "@xyflow/react";
import Image from "next/image";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { StatusDot } from "@/components/ui/StatusDot";
import { cn } from "@/lib/cn";
import { MAX_AGENT_NAME } from "@/lib/hive/agentName";
import { getHiveClient } from "@/lib/hive/client";
import type { Layout } from "@/lib/layout";
import { displayName, useGraph, visibleAgents } from "@/lib/stores/graph";
import { useUi } from "@/lib/stores/ui";
import { topicColor, topicLabel } from "@/lib/topics";
import { AgentMenu, clampToViewport } from "./AgentMenu";
import { AGENT_MIME, freeSlot } from "./GraphCanvas";
import { HideAgentConfirm } from "./HideAgentConfirm";
import { NewAgentModal } from "./NewAgentModal";

const ICONS: Partial<Record<string, string>> = { claude: "/agents/claude.png", gpt: "/agents/gpt.png" };
const eyebrow = "font-mono text-[14px] tracking-[0.1em] text-ink-3";

function useHealth() {
  const [rpc, setRpc] = useState<"checking" | "up" | "down">("checking");
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const h = await (await getHiveClient()).status.health();
        if (alive) setRpc(h.rpcReachable ? "up" : "down");
      } catch {
        if (alive) setRpc("down");
      }
    };
    void check();
    const t = setInterval(check, 15_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return rpc;
}

// Figma sidebar (55:53): agent chips, topics from the edges that exist, network status.
export function Sidebar({ layout, place, unplace }: { layout: Layout; place(patch: Layout, persist?: boolean): void; unplace(id: string): void }) {
  const allAgents = useGraph((s) => s.agents);
  const hidden = useGraph((s) => s.hidden);
  const unhide = useGraph((s) => s.unhide);
  const labels = useGraph((s) => s.labels);
  const setLabel = useGraph((s) => s.setLabel);
  const agentMenu = useUi((s) => s.agentMenu);
  const hideAgent = useUi((s) => s.hideAgent);
  const agents = useMemo(() => visibleAgents(allAgents, hidden), [allAgents, hidden]);
  const hiddenList = useMemo(() => Object.values(allAgents).filter((a) => hidden[a.agentId.toString()]).sort((a, b) => Number(a.agentId - b.agentId)), [allAgents, hidden]);
  const edges = useGraph((s) => s.edges);
  const bridge = useUi((s) => s.bridge);
  const rpc = useHealth();
  const newAgent = useUi((s) => s.newAgent);
  const [editing, setEditing] = useState<string | null>(null);
  const rf = useReactFlow();

  const list = useMemo(() => Object.values(agents).sort((a, b) => Number(a.agentId - b.agentId)), [agents]);
  const topics = useMemo(
    () => [...new Set(Object.values(edges).filter((e) => e.state === "signed" || e.state === "revoking").map((e) => e.topic))].sort(),
    [edges],
  );

  function placeNext(id: string) {
    place({ [id]: freeSlot(Object.values(layout), Object.keys(layout).length, list.length) });
  }

  // A placed agent can be off-screen (a saved position from another window size or a pan): bring it into view and open it.
  function reveal(a: { agentId: bigint }) {
    const p = layout[a.agentId.toString()];
    if (p) void rf.setCenter(p.x + 110, p.y + 36, { zoom: 1, duration: 300 });
    useUi.getState().set({ drawerAgentId: a.agentId });
  }

  function openMenuAt(id: string, at: { x: number; y: number }) {
    useUi.getState().set({ agentMenu: { agentId: id, at: clampToViewport(at) }, hideAgent: null });
  }

  // The ⋯ button opens the same menu under itself.
  function openMenuFrom(id: string, el: HTMLElement) {
    const r = el.getBoundingClientRect();
    openMenuAt(id, { x: r.left, y: r.bottom + 4 });
  }

  // Right-click, or the menu key / Shift+F10, which arrive without coordinates: then the menu opens under the chip.
  function openMenu(id: string, e: MouseEvent<HTMLElement>) {
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    openMenuAt(id, e.clientX === 0 && e.clientY === 0 ? { x: r.left + 16, y: r.bottom - 4 } : { x: e.clientX, y: e.clientY });
  }

  // A new agent lands on the canvas with its drawer open, where its command is ready to copy.
  function created(agentId: bigint) {
    const id = agentId.toString();
    const total = Object.keys(useGraph.getState().agents).length;
    place({ [id]: freeSlot(Object.values(layout), Object.keys(layout).length, total) });
    useUi.getState().set({ drawerAgentId: agentId, newAgent: false });
  }

  return (
    <aside aria-label="Agents and topics" className="flex min-h-0 flex-col overflow-y-auto border-r border-line bg-paper-2 px-5 pt-6 pb-6">
      <h2 className={eyebrow}>AGENTS</h2>
      <ul className="mt-3 flex flex-col gap-3">
        {list.map((a) => {
          const id = a.agentId.toString();
          const placed = !!layout[id];
          const icon = ICONS[a.agentType];
          const label = displayName(a, labels);
          if (editing === id) {
            return (
              <li key={id}>
                <form
                  className="flex h-10 w-full items-center gap-2 rounded-chip border border-ink bg-paper px-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setLabel(a.agentId, new FormData(e.currentTarget).get("label")?.toString() ?? "");
                    setEditing(null);
                  }}
                >
                  <label className="sr-only" htmlFor={`label-${id}`}>Label for {a.name}</label>
                  <input
                    id={`label-${id}`}
                    name="label"
                    defaultValue={labels[id] ?? ""}
                    maxLength={MAX_AGENT_NAME}
                    placeholder={a.name}
                    autoFocus
                    onFocus={(e) => e.currentTarget.select()}
                    onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setEditing(null); } }}
                    onBlur={() => setEditing(null)}
                    className="min-w-0 flex-1 bg-transparent text-[15px] font-medium text-ink outline-none placeholder:text-ink-3"
                  />
                </form>
              </li>
            );
          }
          return (
            <li key={id} className="relative">
              <button
                type="button"
                draggable={!placed}
                onDragStart={(e) => {
                  e.dataTransfer.setData(AGENT_MIME, id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onClick={() => (placed ? reveal(a) : placeNext(id))}
                onContextMenu={(e) => openMenu(id, e)}
                aria-label={`${placed ? `Show ${label} on the canvas` : `Place ${label} on the canvas (or drag it)`}${labels[id] ? `, registered as ${a.name}` : ""}`}
                className={cn(
                  "flex min-h-10 w-full items-center gap-2.5 rounded-chip border border-line bg-paper py-1.5 pr-14 pl-3 text-left",
                  placed ? "cursor-pointer hover:border-ink-3" : "cursor-grab hover:border-ink-3 active:cursor-grabbing",
                )}
              >
                {icon ? <Image src={icon} alt="" width={18} height={18} className="shrink-0" /> : <span aria-hidden="true" className="size-[18px] shrink-0 rounded-full border border-dashed border-clay" />}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-medium text-ink">{label}</span>
                  {labels[id] && <span className="truncate text-[12px] leading-tight text-ink-3">{a.name}</span>}
                </span>
                <span aria-hidden="true" className={cn("absolute top-1/2 right-9 -translate-y-1/2 font-mono text-[14px]", placed ? "text-status-active" : "text-ink-3")}>{placed ? "✓" : "⠿"}</span>
              </button>
              <button
                type="button"
                aria-haspopup="menu"
                aria-label={`Actions for ${label}`}
                onClick={(e) => openMenuFrom(id, e.currentTarget)}
                className="absolute top-1/2 right-1 grid size-8 -translate-y-1/2 cursor-pointer place-items-center rounded-chip text-[18px] leading-none text-ink-2 hover:bg-paper-2 hover:text-ink"
              >
                <span aria-hidden="true">⋯</span>
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="text-[14px] leading-[1.5] text-ink-2">No agents registered yet.</li>}
      </ul>
      <button type="button" onClick={() => useUi.getState().set({ newAgent: true })} className="mt-3 inline-flex min-h-9 cursor-pointer items-center text-[14px] font-medium text-ink-2 underline underline-offset-2 hover:text-ink">
        + New agent
      </button>
      {newAgent && <NewAgentModal onCreated={created} />}
      {hiddenList.length > 0 && (
        <details className="mt-1 text-[14px] text-ink-2">
          <summary className="inline-flex min-h-9 cursor-pointer items-center">{hiddenList.length} hidden</summary>
          <ul className="flex flex-col gap-1.5 pb-1">
            {hiddenList.map((a) => (
              <li key={a.agentId.toString()} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{a.name}</span>
                <button type="button" onClick={() => unhide(a.agentId)} className="min-h-9 shrink-0 cursor-pointer font-medium text-ink underline underline-offset-2">Show</button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <h2 className={cn(eyebrow, "mt-7")}>TOPICS</h2>
      {topics.length ? (
        <ul className="mt-3 flex flex-col gap-3">
          {topics.map((t) => (
            <li key={t} className="flex items-center gap-2.5 font-mono text-[14px] text-ink-2">
              <span aria-hidden="true" className="h-[3px] w-[18px]" style={{ background: topicColor(t) }} />
              {topicLabel(t)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[14px] leading-[1.5] text-ink-2">Topics appear when you sign an edge.</p>
      )}

      <ul className="mt-auto flex flex-col gap-1.5 pt-8 font-mono text-[14px] text-ink-3" aria-label="Network status">
        <li className="flex items-center gap-2">
          <StatusDot size={6} status={rpc === "up" ? "active" : rpc === "down" ? "revoked" : "idle"} />
          <span className="whitespace-pre">Monad  ·  {rpc === "up" ? "connected" : rpc === "down" ? "unreachable" : "checking"}</span>
        </li>
        <li className="flex items-center gap-2">
          <StatusDot size={6} status={bridge === "open" ? "active" : bridge === "offline" ? "revoked" : "idle"} />
          <span className="whitespace-pre">Bridge  ·  {bridge === "open" ? "live" : bridge}</span>
        </li>
      </ul>
      {agentMenu && (
        <AgentMenu
          agentId={agentMenu.agentId}
          at={agentMenu.at}
          placed={!!layout[agentMenu.agentId]}
          onPrimary={() => {
            const a = allAgents[agentMenu.agentId];
            if (!a) return;
            if (layout[agentMenu.agentId]) reveal(a);
            else placeNext(agentMenu.agentId);
          }}
          onEditLabel={() => setEditing(agentMenu.agentId)}
          onTakeOff={() => unplace(agentMenu.agentId)}
        />
      )}
      {hideAgent && <HideAgentConfirm agentId={hideAgent.agentId} at={hideAgent.at} />}
    </aside>
  );
}
