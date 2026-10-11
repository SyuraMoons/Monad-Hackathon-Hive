"use client";

import type { AuditEvent, ContentHash, Provenance } from "@hive/shared";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { explorerTx } from "@/lib/explorer";
import { clockTime, longDate, shortHash } from "@/lib/format";
import { getHiveClient } from "@/lib/hive/client";
import { useFeed } from "@/lib/stores/feed";
import { useGraph } from "@/lib/stores/graph";

const ENVIO_URL = process.env.NEXT_PUBLIC_ENVIO_URL;

function TxLink({ hash }: { hash: string }) {
  return (
    <a href={explorerTx(hash)} target="_blank" rel="noreferrer" className="font-mono text-[14px] whitespace-pre text-ink-2 underline underline-offset-2 hover:text-ink" aria-label={`Transaction ${shortHash(hash)} on Monadscan`}>
      {shortHash(hash)}  →
    </a>
  );
}

function Step({ dot, last, title, meta, tx }: { dot: string; last?: boolean; title: string; meta: string; tx?: string | null }) {
  return (
    <li className="flex gap-3.5">
      <div className="flex flex-col items-center self-stretch" aria-hidden="true">
        <span className={cn("mt-1 size-3 shrink-0 rounded-full", dot)} />
        {!last && <span className="w-0.5 flex-1 bg-clay" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px] pb-3.5">
        <p className="text-[15px] font-medium text-ink">{title}</p>
        <p className="font-mono text-[14px] whitespace-pre-wrap text-ink-3">{meta}</p>
        {tx && <TxLink hash={tx} />}
      </div>
    </li>
  );
}

// Figma Audit 62:234 "Where did this fact go?": the quote is decrypted on this device (rules O4).
export function ProvenanceCard({ contentHash, events }: { contentHash: ContentHash | null; events: AuditEvent[] }) {
  const agents = useGraph((s) => s.agents);
  const rows = useFeed((s) => s.rows);
  const [prov, setProv] = useState<Provenance | null | undefined>(undefined);
  const [quote, setQuote] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!contentHash) return;
    let alive = true;
    setProv(undefined);
    setQuote(undefined);
    void getHiveClient().then(async (c) => {
      const [p, q] = await Promise.all([c.graph.provenance(contentHash).catch(() => null), c.memory.preview(contentHash).catch(() => null)]);
      if (alive) { setProv(p); setQuote(q ? q.content : null); }
    });
    return () => { alive = false; };
  }, [contentHash]);

  const name = (id: bigint) => agents[id.toString()]?.name ?? `#${id}`;

  if (!contentHash) {
    return (
      <aside className="rounded-menu border border-line bg-paper-2 px-6 py-[22px] text-[15px] leading-[1.5] text-ink-2">
        Select a <span className="font-mono text-ink">MemoryWritten</span> row to see where that memory went, and where it didn’t.
      </aside>
    );
  }

  const slot = prov?.slot;
  const writer = slot?.agentId;
  const targets = new Set((prov?.propagations ?? []).map((p) => p.to.toString()));
  // Edge that carried it: the latest EdgeAdded for writer → target on this topic, signed before the write.
  const carriedBy = (to: bigint) =>
    events
      .filter((e): e is Extract<AuditEvent, { kind: "edge.added" }> => e.kind === "edge.added" && e.from === writer && e.to === to && e.topic === slot?.topic && e.at <= (slot?.writtenAt ?? 0))
      .sort((a, b) => b.at - a.at)[0];
  const readAt = (to: bigint) =>
    rows.find((r) => r.kind === "read" && r.readerAgentId === to && writer !== undefined && r.fromAgentIds.includes(writer) && r.at >= (slot?.writtenAt ?? 0))?.at;
  const others = writer === undefined ? [] : Object.values(agents).filter((a) => a.agentId !== writer && !targets.has(a.agentId.toString()));
  const otherTopicEdge = (to: bigint) => events.find((e) => e.kind === "edge.added" && e.from === writer && e.to === to && e.topic !== slot?.topic);

  return (
    <aside aria-live="polite" className="flex flex-col gap-4 rounded-menu border border-ink bg-paper-2 px-6 py-[22px]">
      <p className="font-mono text-[14px] tracking-[0.1em] text-ink-3">WHERE DID THIS FACT GO?</p>
      <blockquote className="font-display text-[22px] leading-[1.3] text-ink">
        {quote === undefined ? <span className="text-ink-3">Decrypting on this device…</span> : quote === null ? <span className="text-ink-3">Couldn’t decrypt this memory here.</span> : `“${quote}”`}
      </blockquote>
      <p className="font-mono text-[14px] whitespace-pre-wrap text-ink-3">hash {shortHash(contentHash)}  ·  decrypted on your device</p>

      {prov === undefined ? (
        <p className="font-mono text-[14px] text-ink-3">Loading provenance…</p>
      ) : prov === null || !slot ? (
        <p className="text-[15px] text-ink-2">No indexed write matches this hash yet.</p>
      ) : (
        <>
          <ol>
            <Step dot="bg-ink" last={targets.size === 0} title={`Written by ${name(slot.agentId)}`} meta={`${clockTime(slot.writtenAt)}  ·  MemoryWritten  ·  topic ${slot.topic}`} tx={slot.txHash} />
            {prov.propagations.map((p, i) => {
              const edge = carriedBy(p.to);
              const read = readAt(p.to);
              const last = i === prov.propagations.length - 1;
              return (
                <li key={`${p.to}`} className="list-none">
                  <ol>
                    <Step
                      dot="bg-amber-strong"
                      title={`Carried by edge ${name(p.from)} → ${name(p.to)}`}
                      meta={edge ? `signed ${clockTime(edge.at)} with passkey  ·  until ${longDate(edge.expiresAt).replace(/ \d{4}$/, "")}` : "edge from your graph"}
                      tx={edge?.txHash}
                    />
                    <Step
                      dot="bg-status-active"
                      last={last}
                      title={`Delivered to ${name(p.to)}`}
                      meta={`${clockTime(p.at)}  ·  MemoryPropagated${read ? `  ·  read ${clockTime(read)}` : ""}`}
                      tx={p.txHash}
                    />
                  </ol>
                </li>
              );
            })}
          </ol>

          {others.map((a) => (
            <p key={a.agentId.toString()} className="flex items-start gap-2.5 rounded-chip border border-dashed border-clay bg-paper px-3.5 py-3 text-[14px] leading-[1.5] text-ink-2">
              <span aria-hidden="true" className="font-mono font-medium text-status-revoked">✕</span>
              <span>
                Not delivered to {a.name}.{" "}
                {otherTopicEdge(a.agentId) ? `No edge covers “${slot.topic}”, so no event was emitted.` : "No edge, so no event was ever emitted."}
              </span>
            </p>
          ))}
        </>
      )}

      {ENVIO_URL ? (
        <a href={ENVIO_URL} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center text-[14px] font-medium whitespace-pre text-ink underline underline-offset-2 hover:text-ink-2">
          Open the raw events on Envio  →
        </a>
      ) : (
        <p className="font-mono text-[14px] text-ink-3">Raw Envio events link appears once the indexer is live.</p>
      )}
    </aside>
  );
}
