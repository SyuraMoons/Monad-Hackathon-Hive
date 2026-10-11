"use client";

import { topicLabel } from "@/lib/topics";
import type { AgentId, EdgeId, Topic } from "@hive/shared";
import { twinsOf } from "@/lib/edgeTwins";
import { legsOf, runLegs, type Leg } from "@/lib/mutualEdge";
import { useFeed } from "@/lib/stores/feed";
import { useGraph } from "@/lib/stores/graph";
import { useSession } from "@/lib/stores/session";
import { useUi } from "@/lib/stores/ui";
import type { TxResult } from "@/lib/hive/types";

/** Live mode only: the signer exists once the passkey keys are back. Runs from a click, so the prompt has a user gesture. */
async function ensureSigner(): Promise<string | undefined> {
  const { mode, unlock } = useSession.getState();
  if (mode !== "live") return undefined;
  try {
    await unlock();
  } catch (e) {
    return e instanceof Error ? e.message : "Could not unlock with the passkey.";
  }
}

const name = (id: bigint) => useGraph.getState().agents[id.toString()]?.name ?? `#${id}`;

/** What one leg did: `stage` is where it stopped, `replaced` whether an old edge was revoked before the new one was sent. */
type Step = (TxResult<{ edgeId: EdgeId }> | TxResult) & { stage: "revoke" | "add"; replaced: boolean };

/**
 * Sign an edge: it draws pending (dashed) at once and turns solid on the receipt (golden rule 6, rules §5.6).
 * With `both` it signs the reverse edge too, one transaction after the other under one toast and one unlock.
 * Signing over a live edge replaces it: the contract has no uniqueness and no expiry setter, so a second addEdge would
 * leave the old edge granting its old expiry. Each leg revokes its live twins first, so a failure in between leaves no
 * access rather than too much (ADR-027).
 * Shared by the canvas and the node drawer so both behave the same.
 */
export async function signEdge({ from, to, topic, expiresAt, update, both = false }: { from: AgentId; to: AgentId; topic: Topic; expiresAt: number; update: boolean; both?: boolean }) {
  const { toast, set } = useUi.getState();
  set({ edgeEditor: null });
  const legs = legsOf(from, to, both);
  const text = (leg: Leg) => `${name(leg.from)} → ${name(leg.to)}`;
  const label = both ? `${name(from)} ↔ ${name(to)}  ·  ${topicLabel(topic)}` : `${text(legs[0])}  ·  ${topicLabel(topic)}`;
  const noun = both ? "edges" : "edge";
  const id = toast({ status: "pending", message: `Signing ${noun}  ·  ${label}` });
  const locked = await ensureSigner();
  if (locked) return void toast({ id, status: "error", message: `Couldn’t sign the ${noun}  ·  ${locked}` });
  // Whether a leg re-signs an edge that is already live, so the toast says "updated" for it.
  const live = (leg: Leg) => Object.values(useGraph.getState().edges).some((e) => e.from === leg.from && e.to === leg.to && e.topic === topic && e.state !== "revoked");
  const updates = legs.map((leg, i) => (i === 0 ? update : live(leg)));
  const replaced = legs.map((leg) => twinsOf(Object.values(useGraph.getState().edges), { ...leg, topic }));
  const where = (leg: Leg, i: number) => (both ? `  ·  edge ${i + 1} of 2  ·  ${text(leg)}  ·  ${topicLabel(topic)}` : `  ·  ${label}`);
  const { results, failedAt } = await runLegs<Step>(legs, async (leg, i) => {
    if (both && replaced[i].length === 0) toast({ id, status: "pending", message: `Signing edge ${i + 1} of 2  ·  ${text(leg)}  ·  ${topicLabel(topic)}` });
    if (replaced[i].length > 0) toast({ id, status: "pending", message: `Replacing the old edge${where(leg, i)}` });
    for (const old of replaced[i]) {
      const gone = await useGraph.getState().removeEdge(old.key);
      if (gone.status !== "confirmed") return { ...gone, stage: "revoke", replaced: false };
    }
    if (replaced[i].length > 0) toast({ id, status: "pending", message: `Signing the new edge${where(leg, i)}` });
    const added = await useGraph.getState().addEdge({ from: leg.from, to: leg.to, topic, expiresAt });
    return { ...added, stage: "add", replaced: replaced[i].length > 0 };
  });
  const last = results[results.length - 1];
  if (failedAt === null && last.status === "confirmed") {
    const done = updates.every(Boolean) ? "Expiry updated" : both ? "Edges signed" : "Edge signed";
    toast({ id, status: "success", message: `${done}  ·  ${label}`, link: { href: last.explorerUrl, label: "View on Monadscan →" } });
    return;
  }
  const failure = results[failedAt ?? 0];
  const reason = failure.status === "failed" ? failure.error.message : "";
  // A failed revoke changes nothing. A failed add after the revoke leaves the leg with no edge: say so, and what to do.
  const left = failure.stage === "revoke" ? "The old edge may still be live" : failure.replaced ? "The old edge was revoked, sign it again" : "";
  const first = results[0];
  // The first leg is a real edge by now: say so, and say which one is missing.
  if (both && failedAt === 1 && first.status === "confirmed") {
    toast({ id, status: "error", message: `${text(legs[0])} is signed, ${text(legs[1])} failed  ·  ${reason}  ·  ${left || "Sign the other direction again"}`, link: { href: first.explorerUrl, label: "View on Monadscan →" } });
    return;
  }
  toast({ id, status: "error", message: `Couldn’t sign the ${noun}  ·  ${reason}${left ? `  ·  ${left}` : ""}` });
}

/**
 * Revoke an edge (KnowledgeGraph.removeEdge): ghost edge, "Edge revoked" toast and a feed row with the tx link.
 * An identical edge (same from, to, topic) grants the read on its own, so they are revoked together, one after the
 * other under one toast and one unlock (ADR-027).
 */
export async function revokeEdge(key: string) {
  const edge = useGraph.getState().edges[key];
  if (!edge || edge.state !== "signed") return;
  const group = [edge, ...twinsOf(Object.values(useGraph.getState().edges), edge).filter((e) => e.key !== key)];
  const many = group.length > 1;
  const { toast, set } = useUi.getState();
  set({ revokeEdge: null, edgeMenu: null });
  const label = `${name(edge.from)} ✕ ${name(edge.to)}  ·  ${topicLabel(edge.topic)}`;
  const id = toast({ status: "pending", message: `Revoking ${many ? `${group.length} identical edges` : "edge"}  ·  ${label}` });
  const locked = await ensureSigner();
  if (locked) return void toast({ id, status: "error", message: `Couldn’t revoke the edge  ·  ${locked}` });
  let lastLink: string | undefined;
  let revoked = 0;
  for (const e of group) {
    const result = await useGraph.getState().removeEdge(e.key);
    if (result.status !== "confirmed") {
      const part = revoked > 0 ? `Revoked ${revoked} of ${group.length} identical edges  ·  ${result.error.message}  ·  Revoke again` : `Couldn’t revoke the edge  ·  ${result.error.message}`;
      return void toast({ id, status: "error", message: part, ...(lastLink && { link: { href: lastLink, label: "View on Monadscan →" } }) });
    }
    revoked += 1;
    lastLink = result.explorerUrl;
    useFeed.getState().push({
      kind: "edge-revoked",
      id: `revoked-${e.key}-${result.txHash}`,
      at: Math.floor(Date.now() / 1000),
      from: e.from,
      to: e.to,
      topic: e.topic,
      txHash: result.txHash,
    });
  }
  toast({ id, status: "revoked", message: `${many ? `${group.length} identical edges revoked` : "Edge revoked"}  ·  ${label}`, link: { href: lastLink!, label: "View on Monadscan →" } });
}
