"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { zeroAddress } from "viem";
import { removeAgent } from "@/lib/agentActions";
import { cn } from "@/lib/cn";
import { explorerAddress, explorerTx } from "@/lib/explorer";
import { longDate, shortHash } from "@/lib/format";
import { historyEntries } from "@/lib/hive/memoryHistory";
import { useFeed } from "@/lib/stores/feed";
import { displayName, useGraph, type AgentNode, type EdgeView } from "@/lib/stores/graph";
import { useSession } from "@/lib/stores/session";
import { useUi } from "@/lib/stores/ui";
import { topicColor, topicLabel } from "@/lib/topics";
import { agentTypeIcon, hasGuide, PRODUCT } from "@/lib/hive/agentTypes";
import { AllHistory, MemoryDetail, MemoryList, button, eyebrow, section } from "./MemoryHistory";

const HISTORY_PAGE_SIZE = 5;

function scopeKey(expiresAt: number | null): string {
  if (!expiresAt) return "not issued · connect this agent first";
  const s = expiresAt - Math.floor(Date.now() / 1000);
  if (s <= 0) return "expired · reconnect to renew";
  return s >= 3600 ? `expires in ${Math.floor(s / 3600)}h` : `expires in ${Math.max(1, Math.floor(s / 60))}m`;
}

// Reconnect after a bridge restart or an expired token; Disconnect ends the bridge session. Both act on the signed-in owner's agent.
function ConnectionSection({ agent }: { agent: AgentNode }) {
  const authorizeAgent = useSession((s) => s.authorizeAgent);
  const disconnectAgent = useSession((s) => s.disconnectAgent);
  const [busy, setBusy] = useState<"reconnect" | "disconnect">();
  const [error, setError] = useState<string>();
  const live = agent.tokenExpiresAt !== null && agent.tokenExpiresAt > Math.floor(Date.now() / 1000);
  const unfinished = agent.agentKey === zeroAddress;

  async function run(kind: "reconnect" | "disconnect") {
    setBusy(kind);
    setError(undefined);
    try {
      await (kind === "reconnect" ? authorizeAgent(agent.agentId) : disconnectAgent(agent.agentId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <section className={section} aria-label="Connection">
      <p className={eyebrow}>CONNECTION</p>
      <p className="text-[15px] leading-[1.5] text-ink-2">
        {unfinished
          ? `${agent.name} was registered, but its setup stopped halfway. Finishing is one transaction.`
          : live
          ? agent.connected
            ? `${agent.name} is connected.`
            : agent.agentType === "claude"
            ? "Authorized. A token under 24h old works again: run /mcp in Claude Code to reconnect."
            : "Authorized. Its token works until it expires: restart the agent or app that uses it to reconnect."
          : `${agent.name} has no session on the bridge. This happens after a bridge restart. Reconnect gives it its keys again.`}
      </p>
      <div className="flex flex-wrap gap-2.5">
        <button type="button" className={button} disabled={busy !== undefined} onClick={() => void run("reconnect")}>
          {busy === "reconnect" ? "Waiting for your passkey…" : unfinished ? "Finish setup" : live ? "Authorize again" : "Reconnect"}
        </button>
        {live && (
          <button type="button" className={button} disabled={busy !== undefined} onClick={() => void run("disconnect")}>
            {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
          </button>
        )}
        {hasGuide(agent.agentType) && !unfinished && (
          <button type="button" className={button} onClick={() => useUi.getState().set({ connectAgent: agent.agentId })}>
            Connect to {PRODUCT[agent.agentType]}…
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-[14px] leading-[1.45] text-status-revoked">{error}</p>}
    </section>
  );
}

// The registry can't delete an agent, so this hides it on this browser and ends its bridge session (ADR-012).
function RemoveSection({ agent }: { agent: AgentNode }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();

  async function remove() {
    const result = await removeAgent(agent.agentId);
    if ("error" in result) setError(result.error);
  }

  return (
    <section className={section} aria-label="Remove">
      <p className={eyebrow}>REMOVE</p>
      {confirming ? (
        <>
          <p className="text-[15px] leading-[1.5] text-ink-2">
            {agent.name} leaves your canvas and its bridge session ends. It stays registered on Monad, and you can show it again from the sidebar.
          </p>
          <div className="flex gap-2.5">
            <button type="button" className={cn(button, "border-status-revoked text-status-revoked")} onClick={() => void remove()}>Remove from canvas</button>
            <button type="button" className={button} onClick={() => { setConfirming(false); setError(undefined); }}>Cancel</button>
          </div>
        </>
      ) : (
        <div>
          <button type="button" className={button} onClick={() => setConfirming(true)}>Remove from canvas</button>
        </div>
      )}
      {error && <p role="alert" className="text-[14px] leading-[1.45] text-status-revoked">{error}</p>}
    </section>
  );
}

// Figma Canvas 5 Node drawer (61:710): covers the feed panel, closes on ✕, Esc or a canvas click.
export function NodeDrawer({ agentId }: { agentId: string }) {
  const agent = useGraph((s) => s.agents[agentId]);
  const agents = useGraph((s) => s.agents);
  const labels = useGraph((s) => s.labels);
  const edges = useGraph((s) => s.edges);
  const rows = useFeed((s) => s.rows);
  const past = useFeed((s) => s.history[agentId]);
  const loadHistory = useFeed((s) => s.loadHistory);
  const view = useUi((s) => s.drawerView);
  const setUi = useUi((s) => s.set);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [historyPage, setHistoryPage] = useState(0);
  const [allPage, setAllPage] = useState(0);
  const writes = historyEntries(past, rows, BigInt(agentId));

  // Another agent, or a closed drawer, starts again on the agent view. Before paint, so the next drawer never shows this one's view.
  useLayoutEffect(() => () => useUi.getState().set({ drawerView: "agent" }), []);

  useEffect(() => {
    void loadHistory(BigInt(agentId));
  }, [agentId, loadHistory]);

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
  const icon = agentTypeIcon(agent.agentType);
  const shownName = displayName(agent, labels);
  const opened = typeof view === "object" ? writes.find((w) => w.slotId.toString() === view.slotId) : undefined;
  const covered = view === "history" || opened !== undefined;

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
          {dir === "out" ? `→ ${name(e.to)}` : `← ${name(e.from)}`}  ·  {topicLabel(e.topic)}
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
    <>
    <aside
      role="dialog"
      aria-labelledby="drawer-title"
      inert={covered}
      className="hive-drawer absolute inset-0 z-20 flex flex-col overflow-y-auto border-l border-ink bg-paper shadow-[-8px_0_24px_rgb(0_0_0/0.12)]"
    >
      <div className="flex items-center gap-3 px-6 pt-[22px] pb-[18px]">
        {icon ? <Image src={icon} alt="" width={28} height={28} /> : <span aria-hidden="true" className="size-7 rounded-full border border-dashed border-clay" />}
        <div className="min-w-0 flex-1">
          <h2 id="drawer-title" className="truncate font-display text-[26px] leading-tight text-ink">{shownName}</h2>
          <p className={cn("truncate font-mono text-[14px] whitespace-pre", agent.connected ? "text-status-active" : "text-ink-3")}>
            agent #{agent.agentId.toString()}  ·  {agent.connected ? "active" : "not connected"}
          </p>
          {labels[agentId] && <p className="truncate font-mono text-[14px] text-ink-3">registered as {agent.name}</p>}
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

      <ConnectionSection agent={agent} />

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

      <section className={section} aria-label="Memory history">
        <p className={eyebrow}>MEMORY HISTORY  ·  {writes.length}</p>
        {past === "error" && <p className="text-[14px] leading-[1.45] text-ink-3">Couldn’t read the history from Monad. New writes still appear here.</p>}
        {past === "loading" && !writes.length && <p className="text-[15px] leading-[1.5] text-ink-2">Loading history from Monad…</p>}
        {writes.length ? (
          <>
            <MemoryList entries={writes} page={historyPage} onPage={setHistoryPage} pageSize={HISTORY_PAGE_SIZE} from="agent" />
            <div>
              <button type="button" onClick={() => setUi({ drawerView: "history" })} className="min-h-9 cursor-pointer text-[15px] font-medium whitespace-pre text-ink underline underline-offset-2 hover:text-ink-2">
                See all {writes.length}  →
              </button>
            </div>
          </>
        ) : (
          past !== "loading" && past !== "error" && <p className="text-[15px] leading-[1.5] text-ink-2">No writes yet.</p>
        )}
      </section>

      <RemoveSection agent={agent} />

      <div className="border-t border-line px-6 py-[18px]">
        <a href={explorerAddress(agent.agentKey)} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center text-[15px] font-medium whitespace-pre text-ink underline underline-offset-2 hover:text-ink-2">
          View agent on Monadscan  →
        </a>
      </div>
    </aside>
    {view === "history" && <AllHistory agentName={shownName} entries={writes} page={allPage} onPage={setAllPage} />}
    {opened && typeof view === "object" && <MemoryDetail key={view.slotId} agentName={shownName} entry={opened} back={view.from} name={name} />}
    </>
  );
}
