"use client";

import { topicLabel } from "@/lib/topics";
import type { AgentId, Topic } from "@hive/shared";
import { legsOf, runLegs, type Leg } from "@/lib/mutualEdge";
import { useFeed } from "@/lib/stores/feed";
import { useGraph } from "@/lib/stores/graph";
import { useSession } from "@/lib/stores/session";
import { useUi } from "@/lib/stores/ui";

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

/**
 * Sign an edge: it draws pending (dashed) at once and turns solid on the receipt (golden rule 6, rules §5.6).
 * With `both` it signs the reverse edge too, one transaction after the other under one toast and one unlock.
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
  const { results, failedAt } = await runLegs(legs, (leg, i) => {
    if (both) toast({ id, status: "pending", message: `Signing edge ${i + 1} of 2  ·  ${text(leg)}  ·  ${topicLabel(topic)}` });
    return useGraph.getState().addEdge({ from: leg.from, to: leg.to, topic, expiresAt });
  });
  const last = results[results.length - 1];
  if (failedAt === null && last.status === "confirmed") {
    const done = updates.every(Boolean) ? "Expiry updated" : both ? "Edges signed" : "Edge signed";
    toast({ id, status: "success", message: `${done}  ·  ${label}`, link: { href: last.explorerUrl, label: "View on Monadscan →" } });
    return;
  }
  const failure = results[failedAt ?? 0];
  const reason = failure.status === "failed" ? failure.error.message : "";
  const first = results[0];
  // The first leg is a real edge by now: say so, and say which one is missing.
  if (both && failedAt === 1 && first.status === "confirmed") {
    toast({ id, status: "error", message: `${text(legs[0])} is signed, ${text(legs[1])} failed  ·  ${reason}  ·  Sign the other direction again`, link: { href: first.explorerUrl, label: "View on Monadscan →" } });
    return;
  }
  toast({ id, status: "error", message: `Couldn’t sign the ${noun}  ·  ${reason}` });
}

/** Revoke an edge (KnowledgeGraph.removeEdge): ghost edge, "Edge revoked" toast and a feed row with the tx link. */
export async function revokeEdge(key: string) {
  const edge = useGraph.getState().edges[key];
  if (!edge || edge.state !== "signed") return;
  const { toast, set } = useUi.getState();
  set({ revokeEdge: null, edgeMenu: null });
  const label = `${name(edge.from)} ✕ ${name(edge.to)}  ·  ${topicLabel(edge.topic)}`;
  const id = toast({ status: "pending", message: `Revoking edge  ·  ${label}` });
  const locked = await ensureSigner();
  if (locked) return void toast({ id, status: "error", message: `Couldn’t revoke the edge  ·  ${locked}` });
  const result = await useGraph.getState().removeEdge(key);
  if (result.status === "confirmed") {
    toast({ id, status: "revoked", message: `Edge revoked  ·  ${label}`, link: { href: result.explorerUrl, label: "View on Monadscan →" } });
    useFeed.getState().push({
      kind: "edge-revoked",
      id: `revoked-${key}-${result.txHash}`,
      at: Math.floor(Date.now() / 1000),
      from: edge.from,
      to: edge.to,
      topic: edge.topic,
      txHash: result.txHash,
    });
  } else {
    toast({ id, status: "error", message: `Couldn’t revoke the edge  ·  ${result.error.message}` });
  }
}
