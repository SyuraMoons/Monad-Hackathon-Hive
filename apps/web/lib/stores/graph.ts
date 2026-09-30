"use client";

import type { Address, Agent, AgentId, AgentStatus, Edge, EdgeId, HiveError, HiveEvent, Topic, TxHash, UnixSeconds } from "@hive/shared";
import { create } from "zustand";
import { getHiveClient } from "@/lib/hive/client";
import type { TxResult } from "@/lib/hive/types";

export type AgentNode = Agent & { connected: boolean; lastCallAt: UnixSeconds | null; tokenExpiresAt: UnixSeconds | null };

/** An edge as the canvas draws it. `pending` stays dashed until the receipt arrives (golden rule 6). */
export type EdgeView = Omit<Edge, "edgeId" | "addedTx"> & {
  key: string;
  edgeId: EdgeId | null;
  addedTx: TxHash | null;
  state: "pending" | "signed" | "revoking" | "revoked";
  explorerUrl?: string;
};

type GraphState = {
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
  agents: Record<string, AgentNode>;
  edges: Record<string, EdgeView>;
  load(owner: Address): Promise<void>;
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

export const useGraph = create<GraphState>()((set, get) => ({
  status: "idle",
  agents: {},
  edges: {},

  async load(owner) {
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
      set({ status: "ready", agents: mergeStatus(agents, statuses), edges });
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
      set({ edges: { ...get().edges, [key]: { ...edge, active: false, removedTx: result.txHash, state: "revoked", explorerUrl: result.explorerUrl } } });
    } else {
      set({ edges: { ...get().edges, [key]: edge } });
    }
    return result;
  },

  reset() {
    set({ status: "idle", error: undefined, agents: {}, edges: {} });
  },
}));
