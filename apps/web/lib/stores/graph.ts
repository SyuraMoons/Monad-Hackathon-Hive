"use client";

import { hiveDeployment, type Address, type Agent, type AgentId, type AgentStatus, type Edge, type EdgeId, type HiveError, type HiveEvent, type Topic, type TxHash, type UnixSeconds } from "@hive/shared";
import { create } from "zustand";
import { getHiveClient } from "@/lib/hive/client";
import { cleanLabel, loadAgentLabels, saveAgentLabels } from "@/lib/hive/agentLabels";
import { loadHidden, saveHidden } from "@/lib/hive/hidden";
import { loadIdentities, saveIdentities, type AgentIdentity } from "@/lib/hive/identities";
import type { TxResult } from "@/lib/hive/types";

export type AgentNode = Agent & { connected: boolean; lastCallAt: UnixSeconds | null; tokenExpiresAt: UnixSeconds | null };

/** An edge as the canvas draws it. `pending` stays dashed until the receipt arrives. */
export type EdgeView = Omit<Edge, "edgeId" | "addedTx"> & {
  key: string;
  edgeId: EdgeId | null;
  addedTx: TxHash | null;
  state: "pending" | "signed" | "revoking" | "revoked";
  explorerUrl?: string;
  /** ms timestamp of the revoke receipt; the ghost edge is drawn for GHOST_MS after it. */
  revokedAt?: number;
};

export const GHOST_MS = 3000;

/** The agents the canvas, sidebar and Connect show: all of them except the ones the owner hid. */
export const visibleAgents = (agents: Record<string, AgentNode>, hidden: Record<string, true>) =>
  Object.fromEntries(Object.entries(agents).filter(([id]) => !hidden[id]));

/** What the owner sees for an agent: their label if they wrote one, else the name it was registered with. */
export const displayName = (agent: Pick<Agent, "name" | "agentId">, labels: Record<string, string>) => labels[agent.agentId.toString()] ?? agent.name;

type GraphState = {
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
  agents: Record<string, AgentNode>;
  edges: Record<string, EdgeView>;
  /** Agent ids removed from the canvas in this browser (ADR-012). The agents stay onchain and in `agents`. */
  hidden: Record<string, true>;
  /** The owner's nickname per agent id, kept in this browser. The registered name stays in `agents` (ADR-018). */
  labels: Record<string, string>;
  /** ERC-8004 identities this browser registered, by Hive agent id (ADR-028). Display only: they grant nothing. */
  identities: Record<string, AgentIdentity>;
  /** False when the bridge is not on a public https URL, so no identity can be added from here. */
  identityAvailable: boolean;
  /** One owner transaction on the ERC-8004 registry. The signer must be unlocked. */
  addIdentity(agentId: AgentId): Promise<TxResult<{ erc8004Id: bigint }>>;
  /** An empty label clears it. */
  setLabel(agentId: AgentId, raw: string): void;
  /** Refused while the agent has a live edge, so a hidden agent never keeps sharing. */
  hide(agentId: AgentId): { ok: true } | { error: string };
  unhide(agentId: AgentId): void;
  load(owner: Address): Promise<void>;
  loadNow(owner: Address): Promise<void>;
  refreshAgents(): Promise<void>;
  applyEvent(event: HiveEvent): void;
  addEdge(input: { from: AgentId; to: AgentId; topic: Topic; expiresAt: UnixSeconds }): Promise<TxResult<{ edgeId: EdgeId }>>;
  removeEdge(key: string): Promise<TxResult>;
  reset(): void;
};

const idKey = (id: bigint) => id.toString();
const pendingKey = (from: AgentId, to: AgentId, topic: Topic) => `pending:${from}-${to}-${topic}`;

const mergeStatus = (agents: Record<string, AgentNode>, statuses: AgentStatus[]) => {
  const next = { ...agents };
  for (const s of statuses) {
    const a = next[idKey(s.agentId)];
    if (a) next[idKey(s.agentId)] = { ...a, connected: s.connected, lastCallAt: s.lastCallAt, tokenExpiresAt: s.tokenExpiresAt };
  }
  return next;
};

const failed = (error: HiveError) => ({ status: "failed" as const, error });

// Sign-in and AppShell both call load(); share one in-flight request per owner so the chain is scanned once.
let inflight: { owner: Address; promise: Promise<void> } | null = null;
let hiddenOwner: Address | undefined;

export const useGraph = create<GraphState>()((set, get) => ({
  status: "idle",
  agents: {},
  edges: {},
  hidden: {},
  labels: {},
  identities: {},
  identityAvailable: false,

  async addIdentity(agentId) {
    const client = await getHiveClient();
    const result = await client.tx.registerIdentity(agentId).wait().catch((e: HiveError) => failed(e));
    if (result.status === "confirmed") {
      const identities = { ...get().identities, [idKey(agentId)]: { erc8004Id: result.erc8004Id.toString(), txHash: result.txHash } };
      set({ identities });
      if (hiddenOwner) saveIdentities(hiveDeployment.agentRegistry, hiddenOwner, identities);
    }
    return result;
  },

  setLabel(agentId, raw) {
    const id = idKey(agentId);
    const { [id]: _old, ...rest } = get().labels;
    void _old;
    const label = cleanLabel(raw);
    const labels = label ? { ...rest, [id]: label } : rest;
    set({ labels });
    if (hiddenOwner) saveAgentLabels(hiddenOwner, labels);
  },

  hide(agentId) {
    const id = idKey(agentId);
    const live = Object.values(get().edges).some((e) => (e.from === agentId || e.to === agentId) && e.state !== "revoked");
    if (live) return { error: "This agent still has edges. Revoke them first." };
    const hidden = { ...get().hidden, [id]: true as const };
    set({ hidden });
    if (hiddenOwner) saveHidden(hiddenOwner, Object.keys(hidden));
    return { ok: true };
  },

  unhide(agentId) {
    const { [idKey(agentId)]: _shown, ...hidden } = get().hidden;
    void _shown;
    set({ hidden });
    if (hiddenOwner) saveHidden(hiddenOwner, Object.keys(hidden));
  },

  load(owner) {
    if (inflight && inflight.owner.toLowerCase() === owner.toLowerCase()) return inflight.promise;
    const promise = get().loadNow(owner).finally(() => {
      if (inflight?.promise === promise) inflight = null;
    });
    inflight = { owner, promise };
    return promise;
  },

  async loadNow(owner) {
    set({ status: "loading", error: undefined });
    try {
      const client = await getHiveClient();
      const [snapshot, statuses] = await Promise.all([client.graph.load(owner), client.agents.list().catch(() => [] as AgentStatus[])]);
      const agents: Record<string, AgentNode> = {};
      for (const a of snapshot.agents) agents[idKey(a.agentId)] = { ...a, connected: false, lastCallAt: null, tokenExpiresAt: null };
      const edges: Record<string, EdgeView> = {};
      for (const e of snapshot.edges) {
        if (!e.active) continue;
        edges[idKey(e.edgeId)] = { ...e, key: idKey(e.edgeId), state: "signed" };
      }
      hiddenOwner = owner;
      set({ status: "ready", agents: mergeStatus(agents, statuses), edges, hidden: Object.fromEntries(loadHidden(owner).map((id) => [id, true as const])), labels: loadAgentLabels(owner), identities: loadIdentities(hiveDeployment.agentRegistry, owner), identityAvailable: client.identity.cardUrl(BigInt(0)) !== null });
      // The indexer knows identities added from another browser. It is optional: without it the local record stands.
      void client.graph.identities(owner).then((indexed) => {
        if (hiddenOwner !== owner || !Object.keys(indexed).length) return;
        const identities = { ...get().identities, ...indexed };
        set({ identities });
        saveIdentities(hiveDeployment.agentRegistry, owner, identities);
      }, () => {});
    } catch (e) {
      set({ status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  },

  async refreshAgents() {
    const statuses = await (await getHiveClient()).agents.list();
    set({ agents: mergeStatus(get().agents, statuses) });
  },

  applyEvent(event) {
    if (event.type !== "agent.connected" && event.type !== "agent.disconnected") return;
    const key = idKey(event.data.agentId);
    const a = get().agents[key];
    if (!a) return;
    const connected = event.type === "agent.connected";
    set({ agents: { ...get().agents, [key]: { ...a, connected, lastCallAt: connected ? event.at : a.lastCallAt } } });
  },

  async addEdge(input) {
    const key = pendingKey(input.from, input.to, input.topic);
    const draft: EdgeView = { ...input, key, edgeId: null, addedTx: null, removedTx: null, active: true, state: "pending" };
    set({ edges: { ...get().edges, [key]: draft } });
    const client = await getHiveClient();
    const result = await client.tx.addEdge(input).wait().catch((e: HiveError) => failed(e));
    const { [key]: _pending, ...rest } = get().edges;
    void _pending;
    if (result.status === "confirmed") {
      const k = idKey(result.edgeId);
      set({ edges: { ...rest, [k]: { ...draft, key: k, edgeId: result.edgeId, addedTx: result.txHash, state: "signed", explorerUrl: result.explorerUrl } } });
    } else {
      set({ edges: rest });
    }
    return result;
  },

  async removeEdge(key) {
    const edge = get().edges[key];
    if (!edge?.edgeId) throw new Error(`Edge ${key} has no onchain ID yet`);
    set({ edges: { ...get().edges, [key]: { ...edge, state: "revoking" } } });
    const client = await getHiveClient();
    const result = await client.tx.removeEdge(edge.edgeId).wait().catch((e: HiveError) => failed(e));
    if (result.status === "confirmed") {
      set({ edges: { ...get().edges, [key]: { ...edge, active: false, removedTx: result.txHash, state: "revoked", revokedAt: Date.now(), explorerUrl: result.explorerUrl } } });
      // The ghost edge fades out over 3 s, then leaves the graph.
      setTimeout(() => {
        const { [key]: gone, ...rest } = get().edges;
        if (gone?.state === "revoked") set({ edges: rest });
      }, GHOST_MS + 200);
    } else {
      set({ edges: { ...get().edges, [key]: edge } });
    }
    return result;
  },

  reset() {
    hiddenOwner = undefined;
    set({ status: "idle", error: undefined, agents: {}, edges: {}, hidden: {}, labels: {}, identities: {}, identityAvailable: false });
  },
}));
