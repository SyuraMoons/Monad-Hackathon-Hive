"use client";

import { topicLabel } from "@/lib/topics";
import type { AgentId, Topic } from "@hive/shared";
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
 * Shared by the canvas and the node drawer so both behave the same.
 */
export async function signEdge({ from, to, topic, expiresAt, update }: { from: AgentId; to: AgentId; topic: Topic; expiresAt: number; update: boolean }) {
  const { toast, set } = useUi.getState();
  set({ edgeEditor: null });
  const label = `${name(from)} → ${name(to)}  ·  ${topicLabel(topic)}`;
  const id = toast({ status: "pending", message: `Signing edge  ·  ${label}` });
  const locked = await ensureSigner();
  if (locked) return void toast({ id, status: "error", message: `Couldn’t sign the edge  ·  ${locked}` });
  const result = await useGraph.getState().addEdge({ from, to, topic, expiresAt });
  if (result.status === "confirmed") {
    toast({ id, status: "success", message: `${update ? "Expiry updated" : "Edge signed"}  ·  ${label}`, link: { href: result.explorerUrl, label: "View on Monadscan →" } });
  } else {
    toast({ id, status: "error", message: `Couldn’t sign the edge  ·  ${result.error.message}` });
  }
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
