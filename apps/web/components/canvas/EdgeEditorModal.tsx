"use client";

import { ALL_TOPICS, zEdgeTopic, zTopic, type AgentId, type Topic } from "@hive/shared";
import { useEffect, useMemo, useState, type RefObject } from "react";
import { Modal } from "@/components/ui/Modal";
import { OptionChip } from "@/components/ui/OptionChip";
import { PillButton } from "@/components/ui/Pill";
import { StatusDot } from "@/components/ui/StatusDot";
import { cn } from "@/lib/cn";
import { FAUCET_URL } from "@/lib/explorer";
import { longDate } from "@/lib/format";
import { getHiveClient } from "@/lib/hive/client";
import { useGraph, visibleAgents } from "@/lib/stores/graph";
import { UNKNOWN_TOPIC } from "@/lib/hive/live/edges";
import { expiresIn, topicColor } from "@/lib/topics";

// The three defaults are only suggestions (step 6/7); existing edge topics are offered too.
const SUGGESTED = ["work", "research", "personal"];
const PRESETS = [
  { key: "24h", seconds: 86_400 },
  { key: "7d", seconds: 7 * 86_400 },
  { key: "30d", seconds: 30 * 86_400 },
] as const;
type ExpiryKey = (typeof PRESETS)[number]["key"] | "custom";


/** Only for the ADR-002 fallback (EOA pays gas). With sponsored userOps lowBalance() is null (rules A5, design D3). */
function useLowBalance() {
  const [balance, setBalance] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void getHiveClient()
      .then((c) => c.status.lowBalance())
      .then((b) => alive && setBalance(b))
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return balance;
}

const toDateInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export type EdgeDraft = { from: AgentId; to: AgentId; topic: Topic; expiresAt: number };

// Figma Canvas 2 Edge editor (56:407); low-balance variant 93:481.
export function EdgeEditorModal({ from, to, initialTopic, onClose, onSign, returnFocus }: {
  from: AgentId;
  to: AgentId;
  /** Preselects this topic when editing an existing edge from the edge menu. */
  initialTopic?: string;
  onClose(): void;
  onSign(draft: EdgeDraft & { update: boolean; both: boolean }): void;
  returnFocus?: RefObject<HTMLElement | null>;
}) {
  const agents = useGraph((s) => s.agents);
  const hidden = useGraph((s) => s.hidden);
  const edges = useGraph((s) => s.edges);
  const fromName = agents[from.toString()]?.name ?? `#${from}`;
  const toName = agents[to.toString()]?.name ?? `#${to}`;

  const liveEdges = useMemo(() => Object.values(edges).filter((e) => e.state !== "revoked"), [edges]);
  const topics = useMemo(() => [...new Set([...SUGGESTED, ...liveEdges.map((e) => e.topic).filter((t) => t !== UNKNOWN_TOPIC && t !== ALL_TOPICS), ...(initialTopic && initialTopic !== ALL_TOPICS ? [initialTopic] : [])])], [liveEdges, initialTopic]);

  // Default: one direction. "Both directions" signs the reverse edge too, with the same topic and expiry.
  const [both, setBoth] = useState(false);
  // Default: the edge covers every topic. "Only one topic" is the opt-in restriction.
  const [onlyOne, setOnlyOne] = useState(!!initialTopic && initialTopic !== ALL_TOPICS);
  const [topic, setTopic] = useState<string>(initialTopic && initialTopic !== ALL_TOPICS ? initialTopic : topics[0]);
  const [adding, setAdding] = useState(false);
  const [newTopic, setNewTopic] = useState("");
  const [expiry, setExpiry] = useState<ExpiryKey>("30d");
  const tomorrow = toDateInput(new Date(Date.now() + 86_400_000));
  const [customDate, setCustomDate] = useState(toDateInput(new Date(Date.now() + 14 * 86_400_000)));

  const typedTopic = !onlyOne ? ALL_TOPICS : adding ? newTopic.trim() : topic;
  const topicCheck = zEdgeTopic.safeParse(typedTopic);
  const topicText = topicCheck.success ? (topicCheck.data === ALL_TOPICS ? "all topics" : `“${topicCheck.data}”`) : "";
  const slugCheck = zTopic.safeParse(newTopic.trim());
  const now = Math.floor(Date.now() / 1000);
  const expiresAt =
    expiry === "custom"
      ? Math.floor(new Date(`${customDate}T23:59:00`).getTime() / 1000)
      : now + PRESETS.find((p) => p.key === expiry)!.seconds;
  const expiryValid = Number.isFinite(expiresAt) && expiresAt > now;

  const existing = topicCheck.success
    ? liveEdges.find((e) => e.from === from && e.to === to && e.topic === topicCheck.data)
    : undefined;
  const existingBack = topicCheck.success
    ? liveEdges.find((e) => e.from === to && e.to === from && e.topic === topicCheck.data)
    : undefined;
  const isPending = (e?: { state: string }) => e?.state === "pending" || e?.state === "revoking";
  const pendingSame = isPending(existing) || (both && isPending(existingBack));
  // "Update" only when every edge this click signs already exists.
  const isUpdate = !!existing && (!both || !!existingBack);

  // "…and Therapy Bot stays out": agents that stay isolated after this edge, from the graph.
  const linked = new Set(liveEdges.filter((e) => e.state !== "pending").flatMap((e) => [e.from.toString(), e.to.toString()]));
  const outsiders = Object.values(visibleAgents(agents, hidden)).filter((a) => a.agentId !== from && a.agentId !== to && !linked.has(a.agentId.toString()));
  const outsideText =
    outsiders.length === 1 ? `, and ${outsiders[0].name} stays out` : outsiders.length > 1 ? `, and ${outsiders.length} other agents stay out` : "";

  const lowBalance = useLowBalance();
  const canSign = topicCheck.success && expiryValid && !pendingSame;

  return (
    <Modal labelledBy="edge-editor-title" onClose={onClose} returnFocus={returnFocus}>
      <div className="flex flex-col gap-1.5">
        <p className="font-mono text-[14px] tracking-[0.1em] text-ink-3">{isUpdate ? "UPDATE EDGE" : "NEW EDGE"}{both ? "S" : ""}</p>
        <h2 id="edge-editor-title" className="font-display text-[32px] leading-tight whitespace-pre text-ink">
          {fromName}  {both ? "↔" : "→"}  {toName}
        </h2>
      </div>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-2.5 text-[15px] font-medium text-ink">Direction</legend>
        <div className="flex flex-wrap gap-2">
          <OptionChip selected={!both} onClick={() => setBoth(false)}>{fromName} → {toName} only</OptionChip>
          <OptionChip selected={both} onClick={() => setBoth(true)}>Both directions</OptionChip>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-2.5 text-[15px] font-medium text-ink">Topic</legend>
        <div className="flex flex-wrap gap-2">
          <OptionChip selected={!onlyOne} onClick={() => setOnlyOne(false)} data-autofocus={!onlyOne ? true : undefined}>All topics</OptionChip>
          <OptionChip selected={onlyOne} onClick={() => setOnlyOne(true)}>Only one topic</OptionChip>
        </div>
        {!onlyOne && <p className="text-[14px] text-ink-3">Everything {fromName} saves can reach {toName}, whatever its topic.</p>}
        {onlyOne && <div className="flex flex-wrap gap-2">
          {topics.map((t) => (
            <OptionChip key={t} selected={!adding && topic === t} onClick={() => { setAdding(false); setTopic(t); }} data-autofocus={!adding && topic === t ? true : undefined}>
              <span aria-hidden="true" className="h-[3px] w-3.5" style={{ background: topicColor(t) }} />
              {t}
            </OptionChip>
          ))}
          <OptionChip selected={adding} onClick={() => setAdding(true)}>+ new</OptionChip>
        </div>}
        {onlyOne && adding && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-topic" className="sr-only">New topic</label>
            <input
              id="new-topic"
              autoFocus
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value.toLowerCase())}
              placeholder="e.g. travel-plans"
              maxLength={31}
              aria-invalid={newTopic !== "" && !slugCheck.success}
              aria-describedby="new-topic-hint"
              className="h-10 rounded-chip border border-line bg-paper px-3 font-mono text-[14px] text-ink placeholder:text-ink-3 focus-visible:border-ink"
            />
            <p id="new-topic-hint" className={cn("text-[14px]", newTopic && !slugCheck.success ? "text-status-revoked" : "text-ink-3")}>
              Lowercase letters, digits and dashes, up to 31 characters.
            </p>
          </div>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-2.5 text-[15px] font-medium text-ink">Expires after</legend>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <OptionChip key={p.key} selected={expiry === p.key} onClick={() => setExpiry(p.key)}>{p.key}</OptionChip>
          ))}
          <OptionChip selected={expiry === "custom"} onClick={() => setExpiry("custom")}>custom</OptionChip>
        </div>
        {expiry === "custom" && (
          <label className="flex items-center gap-3 text-[14px] text-ink-2">
            Until
            <input
              type="date"
              min={tomorrow}
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="h-10 rounded-chip border border-line bg-paper px-3 font-mono text-[14px] text-ink focus-visible:border-ink"
            />
          </label>
        )}
      </fieldset>

      <div className="flex flex-col gap-1.5 rounded-chip bg-paper-2 px-4 py-3.5 text-[15px] leading-[1.5]" aria-live="polite">
        {topicCheck.success && expiryValid ? (
          <>
            <p className="text-ink">
              {both
                ? `${fromName} and ${toName} can each push ${topicText} memory to the other until ${longDate(expiresAt)}.`
                : `${fromName} can push ${topicText} memory to ${toName} until ${longDate(expiresAt)}.`}
            </p>
            <p className="text-ink-2">
              {pendingSame
                ? "An edge here is already being signed. Wait for it to confirm."
                : both
                  ? `Two edges, one per direction, signed one after the other with one passkey prompt.${existing || existingBack ? " An edge that already exists is revoked first and signed again with the new expiry." : ""} Each can be revoked on its own${outsideText}.`
                  : existing
                    ? `This edge already exists (${expiresIn(existing.expiresAt)}). Updating revokes it and signs a new one with the new expiry: two transactions, one passkey prompt.`
                    : `One direction only: ${toName} can’t write back${outsideText}.`}
            </p>
          </>
        ) : (
          <p className="text-ink-2">{!topicCheck.success ? "Pick a topic, or type a new one." : "Pick an expiry in the future."}</p>
        )}
      </div>

      {lowBalance && (
        // Only for the ADR-002 fallback (the Mera EOA pays gas). Hidden while Pimlico sponsors userOps.
        <p className="flex items-start gap-2.5 rounded-chip border border-amber-strong bg-paper-2 px-4 py-3 text-[14px] leading-[1.5] text-ink">
          <StatusDot status="pending" className="mt-1.5" />
          You have {lowBalance}, which may not cover this signature. Get test MON from the faucet, then sign.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <button type="button" onClick={onClose} className="min-h-9 cursor-pointer text-[15px] font-medium text-ink-2 underline underline-offset-2 hover:text-ink">
          Cancel
        </button>
        <div className="flex items-center gap-5">
          {lowBalance && (
            <a href={FAUCET_URL} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center text-[15px] font-medium text-ink underline underline-offset-2">
              Get test MON →
            </a>
          )}
          <PillButton
            disabled={!canSign}
            onClick={() => topicCheck.success && onSign({ from, to, topic: topicCheck.data as Topic, expiresAt, update: !!existing, both })}
          >
            {both ? (isUpdate ? "Update both with passkey" : "Sign both with passkey") : existing ? "Update with passkey" : "Sign with passkey"}
          </PillButton>
        </div>
      </div>
      <p className="font-mono text-[14px] whitespace-pre-wrap text-ink-3">KnowledgeGraph.addEdge(){both ? " × 2" : ""}  ·  Monad testnet</p>
    </Modal>
  );
}
