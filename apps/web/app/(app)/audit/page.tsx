"use client";

import type { AuditEvent, ContentHash, OwnerStats } from "@hive/shared";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ProvenanceCard } from "@/components/audit/ProvenanceCard";
import { StatsStrip } from "@/components/audit/StatsStrip";
import { OptionChip } from "@/components/ui/OptionChip";
import { cn } from "@/lib/cn";
import { explorerTx } from "@/lib/explorer";
import { clockTime, longDate, shortHash } from "@/lib/format";
import { getHiveClient } from "@/lib/hive/client";
import { useFeed } from "@/lib/stores/feed";
import { useGraph } from "@/lib/stores/graph";
import { useSession } from "@/lib/stores/session";
import { topicLabel } from "@/lib/topics";

// Event names exactly as the contracts emit them (rules §4).
const NAME: Record<AuditEvent["kind"], string> = {
  "agent.registered": "AgentRegistered",
  "edge.added": "EdgeAdded",
  "edge.removed": "EdgeRemoved",
  "memory.written": "MemoryWritten",
  "memory.propagated": "MemoryPropagated",
};
// Colour marks the type; the name itself stays ink (amber text fails AA at 14px, design D1).
const DOT: Record<AuditEvent["kind"], string> = {
  "agent.registered": "bg-ink-3",
  "edge.added": "bg-amber-strong",
  "edge.removed": "bg-status-revoked",
  "memory.written": "bg-ink",
  "memory.propagated": "bg-status-active",
};

const FILTERS = [
  { key: "all", label: "All events", kinds: null },
  { key: "edges", label: "Edges", kinds: ["edge.added", "edge.removed"] },
  { key: "writes", label: "Memory writes", kinds: ["memory.written"] },
  { key: "propagation", label: "Propagation", kinds: ["memory.propagated"] },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

const PAGE = 50;

const sameDay = (unix: number) => new Date(unix * 1000).toDateString() === new Date().toDateString();
/** `27 Oct` inside a row (design.md §9). */
const shortDate = (unix: number) => longDate(unix).split(" ").slice(0, 2).join(" ");

/** A write and its deliveries share a content hash; the card on the right is about that memory. */
const hashOf = (e: AuditEvent) => (e.kind === "memory.written" || e.kind === "memory.propagated" ? e.contentHash : null);

function useAuditEvents(owner: string | undefined) {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<OwnerStats | null>(null);
  // Refresh when the graph or the feed changes (a new write, a signed or revoked edge).
  const feedCount = useFeed((s) => s.rows.length);
  const edgeCount = useGraph((s) => Object.keys(s.edges).length);
  const lastFetch = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true; // re-set on (Strict Mode) remount
    return () => { alive.current = false; };
  }, []);
  // Throttled, not debounced: a busy graph must still refresh (at most every 2 s).
  useEffect(() => {
    if (!owner) return;
    const run = () => {
      lastFetch.current = Date.now();
      void getHiveClient()
        .then((c) => c.graph.auditEvents(owner as `0x${string}`))
        .then((ev) => { if (alive.current) { setEvents(ev); setError(null); } })
        .catch((e) => { if (alive.current) setError(e instanceof Error ? e.message : String(e)); });
      // Independent of the rows: if the counters fail the strip stays hidden instead of showing made-up zeros.
      void getHiveClient()
        .then((c) => c.graph.ownerStats(owner as `0x${string}`))
        .then((st) => { if (alive.current) setStats(st); })
        .catch(() => { if (alive.current) setStats(null); });
    };
    const wait = Math.max(0, 2000 - (Date.now() - lastFetch.current));
    if (wait === 0) { run(); return; }
    const t = setTimeout(run, wait);
    return () => clearTimeout(t);
  }, [owner, feedCount, edgeCount]);
  return { events, stats, error };
}

// Figma 08 · Audit (62:170).
export default function AuditPage() {
  const owner = useSession((s) => s.owner);
  const mode = useSession((s) => s.mode);
  const agents = useGraph((s) => s.agents);
  const { events, stats, error } = useAuditEvents(owner);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<ContentHash | null>(null);

  const name = (id: bigint) => agents[id.toString()]?.name ?? `#${id}`;
  const shown = useMemo(() => {
    const kinds = FILTERS.find((f) => f.key === filter)!.kinds as readonly string[] | null;
    return (events ?? []).filter((e) => !kinds || kinds.includes(e.kind));
  }, [events, filter]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const rows = shown.slice(page * PAGE, page * PAGE + PAGE);

  // Open the most recent write by default, like the Figma frame.
  useEffect(() => {
    if (selected || !events) return;
    const w = events.find((e) => e.kind === "memory.written");
    if (w && w.kind === "memory.written") setSelected(w.contentHash);
  }, [events, selected]);
  useEffect(() => setPage(0), [filter]);

  const mono = (t: string) => <code className="font-mono text-[14px]">{t}</code>;
  const sep = <span className="text-ink-3">{"  ·  "}</span>;
  function detail(e: AuditEvent): React.ReactNode {
    switch (e.kind) {
      case "agent.registered": return <>{e.name}{sep}{mono(`#${e.agentId}`)}</>;
      case "edge.added": return <>{name(e.from)} → {name(e.to)}{sep}{topicLabel(e.topic)}{sep}until {shortDate(e.expiresAt)}</>;
      case "edge.removed": return <>{name(e.from)} ✕ {name(e.to)}{sep}{topicLabel(e.topic)}</>;
      case "memory.written": return <>{name(e.agentId)}{sep}{e.topic}{sep}{e.propagatedCount ? mono(shortHash(e.contentHash)) : "0 edges match"}</>;
      case "memory.propagated": return <>{name(e.from)} → {name(e.to)}{sep}{e.topic}{sep}{mono(shortHash(e.contentHash))}</>;
    }
  }

  function select(e: AuditEvent) {
    const hash = hashOf(e);
    if (hash) setSelected(hash);
  }

  return (
    <main className="mx-auto w-full max-w-[1312px] px-8 pt-9 pb-10 xl:px-0">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex flex-col gap-2.5">
          <h1 className="font-display text-[44px] leading-tight tracking-[-0.01em] text-ink">Audit trail</h1>
          <p className="text-[17px] text-ink-2">Every change to your graph, read straight from Envio. Memory stays encrypted; you see hashes and events, not content.</p>
        </div>
        <Link href="/canvas" className="mt-2 inline-flex min-h-9 items-center text-[15px] font-medium whitespace-pre text-ink underline underline-offset-2 hover:text-ink-2">
          ←  Back to canvas
        </Link>
      </div>

      {stats && <StatsStrip stats={stats} />}

      <div className="mt-8 grid items-start gap-8 xl:grid-cols-[820px_460px] xl:justify-between">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter events">
            {FILTERS.map((f) => (
              <OptionChip key={f.key} selected={filter === f.key} onClick={() => setFilter(f.key)} font="body">
                {f.label}
              </OptionChip>
            ))}
          </div>

          <div className="max-h-[560px] overflow-auto rounded-card border border-line">
            <table className="w-full border-collapse text-left text-[14px] tabular-nums">
              <thead className="sticky top-0 z-10 bg-paper-2">
                <tr className="font-mono font-normal text-ink-3">
                  <th scope="col" className="w-24 px-4 py-2.5 font-normal">TIME</th>
                  <th scope="col" className="w-[190px] px-2 py-2.5 font-normal">EVENT</th>
                  <th scope="col" className="px-2 py-2.5 font-normal">DETAIL</th>
                  <th scope="col" className="w-[150px] px-4 py-2.5 font-normal">TX</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e, i) => {
                  const hash = hashOf(e);
                  const selectable = hash !== null;
                  const isSel = selectable && hash === selected;
                  return (
                    <tr
                      key={`${page}-${i}`}
                      tabIndex={selectable ? 0 : undefined}
                      aria-selected={selectable ? isSel : undefined}
                      onClick={() => select(e)}
                      onKeyDown={(k: KeyboardEvent) => { if (!selectable) return; if (k.key === "Enter" || k.key === " ") { k.preventDefault(); select(e); } }}
                      className={cn(
                        "border-t border-line",
                        selectable && "cursor-pointer hover:bg-paper-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink",
                        isSel && "bg-paper-2 shadow-[inset_3px_0_0_var(--color-amber-strong)]",
                      )}
                    >
                      <td className="px-4 py-3 font-mono text-ink-3">
                        <time dateTime={new Date(e.at * 1000).toISOString()} title={`${longDate(e.at)} ${clockTime(e.at)}`}>{sameDay(e.at) ? clockTime(e.at) : shortDate(e.at)}</time>
                      </td>
                      <td className="px-2 py-3">
                        <span className="inline-flex items-center gap-2 font-mono font-medium text-ink">
                          <span aria-hidden="true" className={cn("size-2 rounded-full", DOT[e.kind])} />
                          {NAME[e.kind]}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-ink">{detail(e)}</td>
                      <td className="px-4 py-3">
                        <a
                          href={explorerTx(e.txHash)}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(ev) => ev.stopPropagation()}
                          className="font-mono whitespace-pre text-ink-2 underline underline-offset-2 hover:text-ink"
                          aria-label={`${NAME[e.kind]} transaction ${shortHash(e.txHash)} on Monadscan`}
                        >
                          {shortHash(e.txHash)}  →
                        </a>
                      </td>
                    </tr>
                  );
                })}
                {events && !rows.length && (
                  <tr><td colSpan={4} className="px-4 py-6 text-[15px] text-ink-2">No events of this kind yet.</td></tr>
                )}
                {!events && !error && (
                  <tr><td colSpan={4} className="px-4 py-6 font-mono text-ink-3">Loading events…</td></tr>
                )}
                {error && (
                  <tr><td colSpan={4} className="px-4 py-6 text-[15px] text-status-revoked" role="alert">Couldn’t load events: {error}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <nav className="flex items-center gap-3 font-mono text-[14px] text-ink-2" aria-label="Pages">
              <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="min-h-9 cursor-pointer underline underline-offset-2 disabled:cursor-not-allowed disabled:no-underline disabled:opacity-45">← newer</button>
              <span>page {page + 1} of {pages}</span>
              <button type="button" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} className="min-h-9 cursor-pointer underline underline-offset-2 disabled:cursor-not-allowed disabled:no-underline disabled:opacity-45">older →</button>
            </nav>
          )}
        </div>

        <ProvenanceCard contentHash={selected} events={events ?? []} />
      </div>

      <p className="mt-10 font-mono text-[14px] whitespace-pre-wrap text-ink-3">
        Showing {shown.length} {shown.length === 1 ? "event" : "events"}  ·  {mode === "mock" ? "demo data, not indexed" : "indexed by Envio HyperIndex"}  ·  Monad testnet
      </p>
    </main>
  );
}
