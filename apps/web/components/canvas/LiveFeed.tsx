"use client";

import Link from "next/link";
import { StatusDot } from "@/components/ui/StatusDot";
import { cn } from "@/lib/cn";
import { explorerTx } from "@/lib/explorer";
import { clockTime, shortHash } from "@/lib/format";
import { useFeed, type FeedRow as Row } from "@/lib/stores/feed";
import { useGraph } from "@/lib/stores/graph";
import { useUi } from "@/lib/stores/ui";
import { topicColor, topicLabel } from "@/lib/topics";

function TopicTag({ topic }: { topic: string }) {
  // Topic text stays ink inside a topic-coloured border until D1 is decided (design.md §3.3).
  return (
    <span className="rounded-tag border px-1.5 py-px font-mono text-[14px] leading-tight text-ink" style={{ borderColor: topicColor(topic) }}>
      {topicLabel(topic)}
    </span>
  );
}

const joinNames = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

function FeedRow({ row, newest }: { row: Row; newest: boolean }) {
  const agents = useGraph((s) => s.agents);
  const previews = useFeed((s) => s.previews);
  const name = (id: bigint) => agents[id.toString()]?.name ?? `#${id}`;

  let who: string, topic: string | undefined, message: React.ReactNode, meta: string;
  let txLink: string | undefined;
  if (row.kind === "written") {
    who = name(row.agentId);
    topic = row.topic;
    const p = previews[row.contentHash];
    message = p === undefined || p === "loading" ? <span className="text-ink-3">Decrypting on this device…</span> : p === "error" ? <span className="text-ink-3">Couldn’t decrypt this memory here.</span> : p;
    meta = row.propagatedTo.length
      ? `→ propagated to ${joinNames(row.propagatedTo.map(name))}`
      : `no edge covers “${row.topic}” · stayed with ${who}`;
  } else if (row.kind === "read") {
    who = name(row.readerAgentId);
    message = `Read ${row.count} ${row.count === 1 ? "memory" : "memories"} from ${joinNames(row.fromAgentIds.map(name))}.`;
    meta = "read  ·  decrypted on bridge";
  } else {
    // Canvas 4 Revoked (61:431)
    who = "Edge revoked";
    topic = row.topic;
    message = `${name(row.from)} ✕ ${name(row.to)} on ${row.topic === "*" ? "all topics" : `“${row.topic}”`}. ${name(row.to)}’s next read returns nothing from ${name(row.from)}.`;
    meta = "signed with passkey  ·  ";
    txLink = row.txHash;
  }

  return (
    <li className={cn("flex flex-col gap-1.5 border-t border-line px-5 py-3.5", newest && "bg-paper")}>
      <div className="flex items-center gap-2">
        <span className="text-[14px] font-medium text-ink">{who}</span>
        {topic && <TopicTag topic={topic} />}
        <time className="font-mono text-[14px] text-ink-3" dateTime={new Date(row.at * 1000).toISOString()}>{clockTime(row.at)}</time>
      </div>
      <p className="text-[15px] leading-[1.45] break-words text-ink">{message}</p>
      <p className="font-mono text-[14px] whitespace-pre-wrap text-ink-3">
        {meta}
        {txLink && (
          <a href={explorerTx(txLink)} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink" aria-label={`Revoke transaction ${shortHash(txLink)} on Monadscan`}>
            tx {shortHash(txLink)}
          </a>
        )}
      </p>
    </li>
  );
}

// Figma "Live memory" panel (55:98): shows where memory went, and where it didn't.
export function LiveFeed() {
  const rows = useFeed((s) => s.rows);
  const bridge = useUi((s) => s.bridge);
  const state = bridge === "offline" ? "OFFLINE" : bridge !== "open" ? "CONNECTING" : rows.length ? "LIVE" : "IDLE";

  return (
    <aside aria-label="Live memory" className="flex min-h-0 flex-col border-l border-line bg-paper-2">
      <div className="flex items-center justify-between px-5 pt-5 pb-4">
        <h2 className="font-display text-[22px] text-ink">Live memory</h2>
        <span className={cn("flex items-center gap-1.5 font-mono text-[14px] font-medium", state === "LIVE" ? "text-status-active" : state === "OFFLINE" ? "text-status-revoked" : "text-ink-3")}>
          <StatusDot status={state === "LIVE" ? "active" : state === "OFFLINE" ? "revoked" : "idle"} />
          {state}
        </span>
      </div>

      {rows.length ? (
        <ol className="min-h-0 flex-1 overflow-y-auto" aria-live="polite" aria-relevant="additions">
          {rows.map((r, i) => <FeedRow key={r.id} row={r} newest={i === 0} />)}
        </ol>
      ) : (
        <div className="flex flex-col gap-2 border-t border-line px-5 pt-6 text-[15px]">
          <p className="font-medium text-ink">No memory yet.</p>
          <p className="leading-[1.5] text-ink-2">When an agent writes something, it appears here with exactly where it went, and where it didn’t.</p>
        </div>
      )}

      <div className="border-t border-line px-5 py-3.5">
        <Link href="/audit" className="inline-flex min-h-9 items-center text-[14px] font-medium whitespace-pre text-ink underline underline-offset-2 hover:text-ink-2">
          Full audit trail on Envio  →
        </Link>
      </div>
    </aside>
  );
}
