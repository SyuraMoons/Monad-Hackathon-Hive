"use client";

import { useReactFlow } from "@xyflow/react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { NewAgentForm } from "@/components/app/NewAgentForm";
import { StatusDot } from "@/components/ui/StatusDot";
import { cn } from "@/lib/cn";
import { getHiveClient } from "@/lib/hive/client";
import type { Layout } from "@/lib/layout";
import { useGraph, visibleAgents } from "@/lib/stores/graph";
import { useUi } from "@/lib/stores/ui";
import { topicColor, topicLabel } from "@/lib/topics";
import { AGENT_MIME, freeSlot } from "./GraphCanvas";

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
export function Sidebar({ layout, place }: { layout: Layout; place(patch: Layout, persist?: boolean): void }) {
  const allAgents = useGraph((s) => s.agents);
  const hidden = useGraph((s) => s.hidden);
  const unhide = useGraph((s) => s.unhide);
  const agents = useMemo(() => visibleAgents(allAgents, hidden), [allAgents, hidden]);
  const hiddenList = useMemo(() => Object.values(allAgents).filter((a) => hidden[a.agentId.toString()]).sort((a, b) => Number(a.agentId - b.agentId)), [allAgents, hidden]);
  const edges = useGraph((s) => s.edges);
  const bridge = useUi((s) => s.bridge);
  const rpc = useHealth();
  const [naming, setNaming] = useState(false);
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

  // A new agent lands on the canvas with its drawer open, where its command is ready to copy.
  function created(agentId: bigint) {
    const id = agentId.toString();
    const total = Object.keys(useGraph.getState().agents).length;
    place({ [id]: freeSlot(Object.values(layout), Object.keys(layout).length, total) });
    useUi.getState().set({ drawerAgentId: agentId });
    setNaming(false);
  }

  return (
    <aside aria-label="Agents and topics" className="flex min-h-0 flex-col overflow-y-auto border-r border-line bg-paper-2 px-5 pt-6 pb-6">
      <h2 className={eyebrow}>AGENTS</h2>
      <ul className="mt-3 flex flex-col gap-3">
        {list.map((a) => {
          const id = a.agentId.toString();
          const placed = !!layout[id];
          const icon = ICONS[a.agentType];
          return (
            <li key={id}>
              <button
                type="button"
                draggable={!placed}
                onDragStart={(e) => {
                  e.dataTransfer.setData(AGENT_MIME, id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onClick={() => (placed ? reveal(a) : placeNext(id))}
                aria-label={placed ? `Show ${a.name} on the canvas` : `Place ${a.name} on the canvas (or drag it)`}
                className={cn(
                  "flex h-10 w-full items-center gap-2.5 rounded-chip border border-line bg-paper px-3 text-left",
                  placed ? "cursor-pointer hover:border-ink-3" : "cursor-grab hover:border-ink-3 active:cursor-grabbing",
                )}
              >
                {icon ? <Image src={icon} alt="" width={18} height={18} /> : <span aria-hidden="true" className="size-[18px] rounded-full border border-dashed border-clay" />}
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">{a.name}</span>
                <span aria-hidden="true" className={cn("font-mono text-[14px]", placed ? "text-status-active" : "text-ink-3")}>{placed ? "✓" : "⠿"}</span>
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="text-[14px] leading-[1.5] text-ink-2">No agents registered yet.</li>}
      </ul>
      {naming ? (
        <div className="mt-3">
          <NewAgentForm onCreated={created} onCancel={() => setNaming(false)} />
        </div>
      ) : (
        <button type="button" onClick={() => setNaming(true)} className="mt-3 inline-flex min-h-9 cursor-pointer items-center text-[14px] font-medium text-ink-2 underline underline-offset-2 hover:text-ink">
          + New agent
        </button>
      )}
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
    </aside>
  );
}
