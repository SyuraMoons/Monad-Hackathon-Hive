"use client";

import Image from "next/image";
import { useEffect, useRef, type MouseEvent } from "react";
import { cn } from "@/lib/cn";
import { explorerAddress, explorerTx } from "@/lib/explorer";
import { longDate, shortHash } from "@/lib/format";
import { useFeed } from "@/lib/stores/feed";
import { useGraph, type EdgeView } from "@/lib/stores/graph";
import { useUi } from "@/lib/stores/ui";
import { topicColor } from "@/lib/topics";

const ICONS: Partial<Record<string, string>> = { claude: "/agents/claude.png", gpt: "/agents/gpt.png" };
const eyebrow = "font-mono text-[14px] tracking-[0.08em] whitespace-pre text-ink-3";
const section = "flex flex-col gap-2.5 border-t border-line px-6 py-[18px]";

function scopeKey(expiresAt: number | null): string {
  if (!expiresAt) return "not issued · connect this agent first";
  const s = expiresAt - Math.floor(Date.now() / 1000);
  if (s <= 0) return "expired · reconnect to renew";
  return s >= 3600 ? `expires in ${Math.floor(s / 3600)}h` : `expires in ${Math.max(1, Math.floor(s / 60))}m`;
}

// Figma Canvas 5 Node drawer (61:710): covers the feed panel, closes on ✕, Esc or a canvas click.
export function NodeDrawer({ agentId }: { agentId: string }) {
  const agent = useGraph((s) => s.agents[agentId]);
  const agents = useGraph((s) => s.agents);
  const edges = useGraph((s) => s.edges);
  const rows = useFeed((s) => s.rows);
  const previews = useFeed((s) => s.previews);
  const setUi = useUi((s) => s.set);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, [agentId]);

  if (!agent) return null;
  const name = (id: bigint) => agents[id.toString()]?.name ?? `#${id}`;
  const live = Object.values(edges).filter((e) => e.state === "signed" || e.state === "revoking" || e.state === "pending");
  const outgoing = live.filter((e) => e.from === agent.agentId);
  const incoming = live.filter((e) => e.to === agent.agentId);
  const writes = rows.filter((r) => r.kind === "written" && r.agentId === agent.agentId).slice(0, 5);
  const icon = ICONS[agent.agentType];

  function revoke(e: EdgeView, ev: MouseEvent<HTMLButtonElement>) {
    // anchor the confirm card to the left of the drawer, level with the row
    const canvas = document.querySelector<HTMLElement>("[data-hive-canvas]")?.getBoundingClientRect();
    const row = ev.currentTarget.getBoundingClientRect();
    const at = canvas ? { x: Math.max(16, canvas.width - 406), y: Math.min(Math.max(16, row.top - canvas.top - 40), canvas.height - 330) } : { x: 16, y: 16 };
    setUi({ revokeEdge: { key: e.key, at } });
  }

  const EdgeRow = ({ e, dir }: { e: EdgeView; dir: "out" | "in" }) => (
    <li className="flex items-center justify-between gap-3 rounded-chip border px-3 py-2.5" style={{ borderColor: e.state === "pending" ? "var(--color-ink-3)" : topicColor(e.topic) }}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-[15px] font-medium whitespace-pre text-ink">
          {dir === "out" ? `→ ${name(e.to)}` : `← ${name(e.from)}`}  ·  {e.topic}
        </p>
        <p className="font-mono text-[14px] whitespace-pre text-ink-3">
          {e.state === "pending" ? "pending" : `until ${longDate(e.expiresAt).replace(/ \d{4}$/, "")}`}
          {e.addedTx ? (
            <>
              {"  ·  "}
              <a href={explorerTx(e.addedTx)} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">{shortHash(e.addedTx)}</a>
            </>
          ) : null}
        </p>
      </div>
      {e.state === "signed" && (
        <button type="button" onClick={(ev) => revoke(e, ev)} className="min-h-9 shrink-0 cursor-pointer text-[14px] font-medium text-status-revoked underline underline-offset-2">
          Revoke
        </button>
      )}
    </li>
  );

  return (
    <aside
      role="dialog"
      aria-labelledby="drawer-title"
      className="hive-drawer absolute inset-0 z-20 flex flex-col overflow-y-auto border-l border-ink bg-paper shadow-[-8px_0_24px_rgb(0_0_0/0.12)]"
    >
      <div className="flex items-center gap-3 px-6 pt-[22px] pb-[18px]">
        {icon ? <Image src={icon} alt="" width={28} height={28} /> : <span aria-hidden="true" className="size-7 rounded-full border border-dashed border-clay" />}
        <div className="min-w-0 flex-1">
          <h2 id="drawer-title" className="truncate font-display text-[26px] leading-tight text-ink">{agent.name}</h2>
          <p className={cn("truncate font-mono text-[14px] whitespace-pre", agent.connected ? "text-status-active" : "text-ink-3")}>
            agent #{agent.agentId.toString()}  ·  {agent.connected ? "active" : "not connected"}
          </p>
        </div>
        <button ref={closeRef} type="button" onClick={() => setUi({ drawerAgentId: null })} aria-label="Close" className="grid size-9 cursor-pointer place-items-center rounded-chip text-[18px] text-ink-2 hover:bg-paper-2 hover:text-ink">
          ✕
        </button>
      </div>

      <section className={section} aria-label="Identity">
        <p className={eyebrow}>IDENTITY</p>
        <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-1.5 text-[14px]">
          <dt className="text-ink-3">agent key</dt>
          <dd className="font-mono text-ink"><a href={explorerAddress(agent.agentKey)} target="_blank" rel="noreferrer" className="underline underline-offset-2">{shortHash(agent.agentKey)}</a></dd>
          <dt className="text-ink-3">owner</dt>
          <dd className="font-mono text-ink">{shortHash(agent.owner)}</dd>
          <dt className="text-ink-3">registered</dt>
          <dd className="font-mono text-ink">{longDate(agent.registeredAt)}</dd>
          <dt className="text-ink-3">scope key</dt>
          <dd className="font-mono text-ink">{scopeKey(agent.tokenExpiresAt)}</dd>
        </dl>
      </section>

      <section className={section} aria-label="Outgoing edges">
        <p className={eyebrow}>OUTGOING EDGES  ·  {outgoing.length}</p>
        {outgoing.length ? <ul className="flex flex-col gap-2">{outgoing.map((e) => <EdgeRow key={e.key} e={e} dir="out" />)}</ul> : (
          <p className="text-[15px] leading-[1.5] text-ink-2">{agent.name} shares nothing. What it learns stays with it.</p>
        )}
      </section>

      <section className={section} aria-label="Incoming edges">
        <p className={eyebrow}>INCOMING EDGES  ·  {incoming.length}</p>
        {incoming.length ? <ul className="flex flex-col gap-2">{incoming.map((e) => <EdgeRow key={e.key} e={e} dir="in" />)}</ul> : (
          <p className="text-[15px] leading-[1.5] text-ink-2">Nothing flows into {agent.name}. Other agents can’t write to it.</p>
        )}
      </section>

      <section className={section} aria-label="Recent writes">
        <p className={eyebrow}>RECENT WRITES  ·  {writes.length}</p>
        {writes.length ? (
          <ul className="flex flex-col gap-3">
            {writes.map((w) => {
              if (w.kind !== "written") return null;
              const p = previews[w.contentHash];
              return (
                <li key={w.id} className="flex flex-col gap-1">
                  <p className="text-[15px] leading-[1.45] break-words text-ink">
                    {p && p !== "loading" && p !== "error" ? p : <span className="text-ink-3">{p === "error" ? "Couldn’t decrypt this memory here." : "Decrypting on this device…"}</span>}
                  </p>
                  <p className="flex items-center gap-2 font-mono text-[14px] whitespace-pre text-ink-2">
                    <span aria-hidden="true" className="h-[3px] w-3.5" style={{ background: topicColor(w.topic) }} />
                    {w.topic}  ·  {w.propagatedTo.length ? `→ ${w.propagatedTo.map(name).join(", ")}` : "stayed here"}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[15px] leading-[1.5] text-ink-2">No writes yet in this session.</p>
        )}
      </section>

      <div className="border-t border-line px-6 py-[18px]">
        <a href={explorerAddress(agent.agentKey)} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center text-[15px] font-medium whitespace-pre text-ink underline underline-offset-2 hover:text-ink-2">
          View agent on Monadscan  →
        </a>
      </div>
    </aside>
  );
}
