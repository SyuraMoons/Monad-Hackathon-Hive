import {
  authMessage,
  HiveError,
  zAddress,
  zAgentsResponse,
  zAuditEvent,
  zAuthorizeResponse,
  zAuthChallengeResponse,
  zAuthVerifyResponse,
  zContentHash,
  zGraphSnapshot,
  zHealthResponse,
  zHiveEvent,
  zOwnerStats,
  zProvenance,
  zSlotId,
  zTopic,
  zTxHash,
  type Address,
  type AuditEvent,
  type GraphSnapshotWire,
  type HiveEventWire,
} from "@hive/shared";
import { verifyMessage } from "viem";
import { privateKeyToAddress } from "viem/accounts";
import { explorerTx } from "@/lib/explorer";
import type { BridgeStatus, HiveClient, TxHandle, TxResult } from "../types";
import { initialGraph, MOCK_LIVE_WRITES, MOCK_MEMORY, MOCK_OWNER, MOCK_SEED_EVENTS, now, stressGraph } from "./data";
import { latency, mockFlag, randomHex32 } from "./flags";

type SlotWire = {
  slotId: string; agentId: string; topic: string; contentHash: string; txHash: string;
  writtenAt: number; propagatedTo: string[];
};

const DAY = 86_400;
const offline = () => new HiveError("INTERNAL", "The Hive bridge is unreachable.");

export type MockHiveClient = HiveClient & {
  /** The demo agents become the signed-in owner's, keyed m/44'/60'/0'/0/{n} (n = position + 1) of their passkey. */
  adoptDemoAgents(owner: Address, agentKey: (n: number) => Address): void;
};

export function createMockClient(): MockHiveClient {
  const stress = mockFlag("stress");
  const graph: GraphSnapshotWire = mockFlag("no-agents") ? { agents: [], edges: [] } : stress ? stressGraph() : initialGraph();
  // Stress: a random agent writes on the topic of its outgoing edge, so every write pulses.
  const stressWrite = () => {
    const e = graph.edges[Math.floor(Math.random() * graph.edges.length)];
    return { agentId: String(e.from), topic: e.topic, content: `Stress write ${Date.now()}` };
  };
  const memory: Record<string, string> = { ...MOCK_MEMORY };
  const slots: SlotWire[] = [];
  // Stable audit facts, like indexed events: one tx per registration, and when each edge was added / removed.
  const registerTx = new Map<string, string>();
  const edgeTimes = new Map<string, { addedAt: number; removedAt?: number }>(graph.edges.map((e) => [String(e.edgeId), { addedAt: now() - 25 * 60 }]));
  const txFor = (agentId: string) => registerTx.get(agentId) ?? (registerTx.set(agentId, randomHex32()), registerTx.get(agentId)!);
  // Agents start disconnected, like after a bridge restart: the Connect page authorizes them (rules §5.1).
  const sessions = new Map<string, { lastCallAt: number; tokenExpiresAt: number }>();
  const listeners = new Set<(e: HiveEventWire) => void>();
  const nonces = new Map<string, string>();
  let seq = 0, nextSlot = 1, nextEdge = 2, nextAgent = graph.agents.length + 1, nextIdentity = 2142, writeIdx = 0;
  let owner: Address = MOCK_OWNER;
  const demoAgents = graph.agents.length;

  const emit = (e: Omit<HiveEventWire, "id" | "at"> & { at?: number }) => {
    const wire = { id: `mock-${++seq}`, at: e.at ?? now(), ...e } as HiveEventWire;
    listeners.forEach((l) => l(wire));
  };

  const activeTargets = (from: string, topic: string) =>
    graph.edges.filter((e) => e.active && String(e.from) === from && e.topic === topic && e.expiresAt > now()).map((e) => String(e.to));

  function recordWrite(agentId: string, topic: string, contentHash: string, at: number, propagatedTo: string[]) {
    const slot: SlotWire = { slotId: String(nextSlot++), agentId, topic, contentHash, txHash: randomHex32(), writtenAt: at, propagatedTo };
    slots.push(slot);
    return slot;
  }

  // Seed the history shown in Figma, so Audit and provenance have something to find.
  for (const s of MOCK_SEED_EVENTS) {
    if (s.type === "memory.written" && graph.agents.length) {
      recordWrite(s.data.agentId, s.data.topic, s.data.contentHash, now() - s.ago, [...s.data.propagatedTo]);
    }
  }

  function tx<T extends object>(run: () => T | HiveError): TxHandle<T> {
    return {
      status: "pending",
      async wait(): Promise<TxResult<T>> {
        await latency();
        await latency();
        if (mockFlag("tx-fail")) return { status: "failed", error: new HiveError("CHAIN_ERROR", "The transaction reverted onchain.") };
        const out = run();
        if (out instanceof HiveError) return { status: "failed", error: out };
        const txHash = zTxHash.parse(randomHex32());
        return { status: "confirmed", txHash, explorerUrl: explorerTx(txHash), ...out };
      },
    };
  }

  return {
    mode: "mock",

    adoptDemoAgents(newOwner, agentKey) {
      owner = newOwner;
      // Only the seeded agents: ones registered in this tab already carry a real passkey's keys.
      graph.agents.slice(0, demoAgents).forEach((a, i) => {
        a.owner = newOwner;
        a.agentKey = agentKey(i + 1);
      });
    },

    status: {
      async health() {
        await latency();
        if (mockFlag("bridge-offline")) throw offline();
        return zHealthResponse.parse({ ok: true, chainId: 10143, rpcReachable: true, supabaseReachable: true, activeSessions: sessions.size, version: "mock" });
      },
      // ?mock=low-balance previews the ADR-002 fallback warning (Figma 93:481).
      lowBalance: async () => (mockFlag("low-balance") ? "0.001 MON" : null),
      balance: async () => (mockFlag("low-balance") ? { mon: "0.0010", low: true } : { mon: "12.5000", low: false }),
    },

    auth: {
      async challenge(owner) {
        await latency();
        if (mockFlag("bridge-offline")) throw offline();
        const nonce = randomHex32().slice(2, 34);
        nonces.set(nonce, zAddress.parse(owner));
        return zAuthChallengeResponse.parse({ nonce, expiresAt: now() + 300 });
      },
      async verify({ owner, nonce, signature }) {
        await latency();
        const expected = nonces.get(nonce);
        nonces.delete(nonce);
        // A real signature check, same as the bridge will do (viem verifyMessage).
        if (!expected || expected !== zAddress.parse(owner) || !(await verifyMessage({ address: expected, message: authMessage(expected, nonce), signature }))) {
          throw new HiveError("UNAUTHORIZED", "The sign-in signature didn't match.");
        }
        const { userToken, expiresAt } = zAuthVerifyResponse.parse({ userToken: `mock-user-token-${nonce.slice(0, 8)}`, expiresAt: now() + DAY });
        return { owner: expected, userToken, expiresAt };
      },
      async signOut() {
        await latency();
        for (const id of sessions.keys()) emit({ type: "agent.disconnected", data: { agentId: id } });
        sessions.clear();
      },
    },

    agents: {
      async list() {
        await latency();
        if (mockFlag("bridge-offline")) throw offline();
        return zAgentsResponse.parse(
          graph.agents.map((a) => {
            const s = sessions.get(String(a.agentId));
            return { agentId: a.agentId, name: a.name, agentType: a.agentType, connected: !!s, lastCallAt: s?.lastCallAt ?? null, tokenExpiresAt: s?.tokenExpiresAt ?? null };
          }),
        );
      },
      async authorize(agentId, { agentPrivateKey }) {
        await latency();
        if (mockFlag("bridge-offline")) throw offline();
        const id = String(agentId);
        const agent = graph.agents.find((a) => String(a.agentId) === id);
        if (!agent) throw new HiveError("NOT_FOUND", `Agent #${id} is not registered.`);
        // Same check as the bridge: the delegated key must be the agent key registered onchain.
        if (privateKeyToAddress(agentPrivateKey).toLowerCase() !== agent.agentKey.toLowerCase()) {
          throw new HiveError("FORBIDDEN", "That key doesn't belong to this agent.");
        }
        // Simulate the agent's first MCP call a few seconds after the command is pasted.
        setTimeout(() => {
          sessions.set(id, { lastCallAt: now(), tokenExpiresAt: now() + DAY });
          emit({ type: "agent.connected", data: { agentId: id } });
        }, 2500 + Math.random() * 2000);
        return zAuthorizeResponse.parse({ agentToken: `hive_sk_mock_${id}_${randomHex32().slice(2, 10)}`, expiresAt: now() + DAY, mcpUrl: "http://localhost:4000/mcp" });
      },
      async disconnect(agentId) {
        await latency();
        const id = String(agentId);
        if (sessions.delete(id)) emit({ type: "agent.disconnected", data: { agentId: id } });
      },
    },

    oauth: {
      // No real OAuth in the mock: send the browser back to the redirect URI with a made-up code.
      async approve({ request, decision }) {
        await latency();
        const to = new URL(request.redirect_uri);
        if (decision === "deny") to.searchParams.set("error", "access_denied");
        else to.searchParams.set("code", `mock-code-${randomHex32().slice(2, 10)}`);
        if (request.state) to.searchParams.set("state", request.state);
        return { redirectTo: to.toString() };
      },
    },

    graph: {
      async load(owner) {
        await latency();
        // The demo graph belongs to whoever signs in (see adoptDemoAgents).
        const snapshot = structuredClone(graph);
        snapshot.agents.forEach((a) => (a.owner = owner));
        return zGraphSnapshot.parse(snapshot);
      },
      async auditEvents() {
        await latency();
        const rows: unknown[] = [
          ...graph.agents.map((a) => ({ kind: "agent.registered", at: a.registeredAt, txHash: txFor(String(a.agentId)), agentId: a.agentId, name: a.name, agentType: a.agentType })),
          ...graph.edges.map((e) => ({ kind: "edge.added", at: edgeTimes.get(String(e.edgeId))?.addedAt ?? now(), txHash: e.addedTx, edgeId: e.edgeId, from: e.from, to: e.to, topic: e.topic, expiresAt: e.expiresAt })),
          ...graph.edges.filter((e) => e.removedTx).map((e) => ({ kind: "edge.removed", at: edgeTimes.get(String(e.edgeId))?.removedAt ?? now(), txHash: e.removedTx, edgeId: e.edgeId, from: e.from, to: e.to, topic: e.topic })),
          ...slots.flatMap((s) => [
            { kind: "memory.written", at: s.writtenAt, txHash: s.txHash, slotId: s.slotId, agentId: s.agentId, contentHash: s.contentHash, topic: s.topic, propagatedCount: s.propagatedTo.length },
            ...s.propagatedTo.map((to) => ({ kind: "memory.propagated", at: s.writtenAt, txHash: s.txHash, slotId: s.slotId, from: s.agentId, to, contentHash: s.contentHash, topic: s.topic })),
          ]),
        ];
        return rows.map((r) => zAuditEvent.parse(r)).sort((a: AuditEvent, b: AuditEvent) => b.at - a.at);
      },
      async provenance(contentHash) {
        await latency();
        const s = slots.find((x) => x.contentHash === contentHash);
        if (!s) return null;
        return zProvenance.parse({
          slot: { slotId: s.slotId, agentId: s.agentId, contentHash: s.contentHash, topic: s.topic, propagatedCount: s.propagatedTo.length, txHash: s.txHash, writtenAt: s.writtenAt },
          propagations: s.propagatedTo.map((to) => ({ slotId: s.slotId, from: s.agentId, to, contentHash: s.contentHash, topic: s.topic, txHash: s.txHash, at: s.writtenAt })),
        });
      },
      // The mock has no indexer: an identity added in this tab is remembered by the graph store.
      async identities() {
        return {};
      },
      async ownerStats() {
        await latency();
        // The mock only delivers along active edges, so there is never a delivery to flag.
        return zOwnerStats.parse({
          agents: graph.agents.length,
          edgesAdded: graph.edges.length,
          edgesRevoked: graph.edges.filter((e) => e.removedTx).length,
          memories: slots.length,
          propagations: slots.reduce((n, s) => n + s.propagatedTo.length, 0),
          violations: 0,
        });
      },
    },

    events: {
      subscribe(onEvent, onStatus) {
        const status = (s: BridgeStatus) => onStatus?.(s);
        const deliver = (wire: unknown) => {
          const parsed = zHiveEvent.safeParse(wire);
          if (parsed.success) onEvent(parsed.data);
          else console.error("[hive mock] dropped invalid event", parsed.error.issues);
        };
        const timers: ReturnType<typeof setTimeout>[] = [];
        let interval: ReturnType<typeof setInterval> | undefined;
        status("connecting");

        if (mockFlag("bridge-offline")) {
          timers.push(setTimeout(() => status("offline"), 800));
          return () => timers.forEach(clearTimeout);
        }

        timers.push(setTimeout(() => {
          listeners.add(deliver);
          status("open");
          if (graph.agents.length && !stress) {
            for (const s of MOCK_SEED_EVENTS) deliver({ id: `seed-${s.ago}`, at: now() - s.ago, type: s.type, data: s.data });
          }
          interval = setInterval(() => {
            if (!graph.agents.length) return;
            const w = stress ? stressWrite() : MOCK_LIVE_WRITES[writeIdx++ % MOCK_LIVE_WRITES.length];
            const contentHash = randomHex32();
            memory[contentHash] = w.content;
            const targets = activeTargets(w.agentId, w.topic);
            const slot = recordWrite(w.agentId, w.topic, contentHash, now(), targets);
            emit({ type: "memory.written", data: { slotId: slot.slotId, agentId: w.agentId, topic: w.topic, contentHash, txHash: slot.txHash, propagatedTo: targets } });
            if (targets.length && !stress) {
              timers.push(setTimeout(() => emit({ type: "memory.read", data: { readerAgentId: targets[0], fromAgentIds: [w.agentId], count: 1 } }), 2000));
            }
          }, stress ? 250 : 9000);
        }, 300 + Math.random() * 500));

        return () => {
          listeners.delete(deliver);
          timers.forEach(clearTimeout);
          if (interval) clearInterval(interval);
        };
      },
    },

    memory: {
      async history(agentId) {
        await latency();
        if (mockFlag("bridge-offline")) throw offline();
        return slots
          .filter((s) => s.agentId === String(agentId))
          .map((s) => ({ slotId: zSlotId.parse(s.slotId), topic: zTopic.parse(s.topic), contentHash: zContentHash.parse(s.contentHash), writtenAt: s.writtenAt }))
          .sort((a, b) => b.writtenAt - a.writtenAt)
          .slice(0, 50);
      },
      async preview(contentHash) {
        await latency();
        if (mockFlag("bridge-offline")) throw offline();
        const text = memory[contentHash];
        if (text === undefined) throw new HiveError("NOT_FOUND", "No memory with that content hash.");
        return { content: text };
      },
    },

    identity: {
      cardUrl: (agentId) => `https://bridge.mock.example/agents/${agentId}/card.json`,
    },

    tx: {
      registerIdentity(agentId) {
        return tx(() => {
          if (!graph.agents.some((a) => a.agentId === String(agentId))) return new HiveError("CHAIN_ERROR", "No such agent.");
          return { erc8004Id: BigInt(nextIdentity++) };
        });
      },
      registerAgent({ name, agentType, agentKey }) {
        return tx(() => {
          if (graph.agents.some((a) => a.agentKey.toLowerCase() === agentKey.toLowerCase())) return new HiveError("CHAIN_ERROR", "That agent key is already registered.");
          const agentId = String(nextAgent++);
          graph.agents.push({ agentId, owner, agentKey, name, agentType, registeredAt: now() });
          return { agentId: BigInt(agentId) };
        });
      },
      addEdge({ from, to, topic, expiresAt }) {
        return tx(() => {
          if (from === to) return new HiveError("CHAIN_ERROR", "SelfEdge: an agent can't share with itself.");
          if (expiresAt <= now()) return new HiveError("CHAIN_ERROR", "ExpiryInPast: pick a later expiry.");
          const existing = graph.edges.find((e) => e.active && String(e.from) === String(from) && String(e.to) === String(to) && e.topic === topic);
          if (existing) {
            existing.expiresAt = expiresAt;
            return { edgeId: BigInt(existing.edgeId) };
          }
          const edgeId = String(nextEdge++);
          graph.edges.push({ edgeId, from: String(from), to: String(to), topic, expiresAt, active: true, addedTx: randomHex32(), removedTx: null });
          edgeTimes.set(edgeId, { addedAt: now() });
          return { edgeId: BigInt(edgeId) };
        });
      },
      removeEdge(edgeId) {
        return tx(() => {
          const edge = graph.edges.find((e) => String(e.edgeId) === String(edgeId) && e.active);
          if (!edge) return new HiveError("CHAIN_ERROR", `EdgeInactive: edge #${edgeId} is not active.`);
          edge.active = false;
          edge.removedTx = randomHex32();
          edgeTimes.set(String(edge.edgeId), { addedAt: edgeTimes.get(String(edge.edgeId))?.addedAt ?? now(), removedAt: now() });
          return {};
        });
      },
    },
  };
}
