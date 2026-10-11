import { DEFAULT_TOPIC, HiveError, zEdgeId, zTxHash } from "@hive/shared";
import { formatEther, parseEther } from "viem";
import { explorerTx } from "@/lib/explorer";
import { hivePublicClient } from "../clients";
import type { HiveSigner } from "../signer";
import type { HiveClient, Session } from "../types";
import { createBridgeApi } from "./bridge";
import { agentIdentities, auditEvents, ownerStats, provenance } from "./audit";
import { envioAudit } from "./auditEnvio";
import { agentHistory } from "./history";
import { chainHistory } from "./historyChain";
import { loadEdgeNotes, saveEdgeNote } from "../edgeNotes";
import { addEdgeTx, edgesOf, removeEdgeTx } from "./edges";
import { chainEdges, edgeReader } from "./edgesChain";
import { identityCardUrl, registerIdentity } from "./identity";
import { chainIdentity } from "./identityChain";
import { registerAndBind, toAgent } from "./registry";
import { previewMemory } from "./preview";
import { chainReader, chainRegistry } from "./registryChain";

// Sign-in and agent sessions talk to the real bridge, agents are read from the AgentRegistry and edges from KnowledgeGraph.
// Audit and provenance are read from the Envio indexer (NEXT_PUBLIC_ENVIO_URL). Memory preview comes from the bridge.

/** The owner's Mera account pays gas (ADR-006), so below this the edge editor points to the faucet. */
const LOW_BALANCE = parseEther("0.05");

export type LiveHiveClient = HiveClient & {
  /** The signed-in owner's signer and encryption keys (current first, then the legacy one, ADR-029), set by the session store after sign-in and cleared on sign-out. Memory only. */
  useSigner(signer: HiveSigner | null, encryptionKeys?: Uint8Array[]): void;
  /** Puts a saved session back after a reload, with no keys: the signer comes later, from the passkey. */
  resume(session: Session): void;
};

export function createLiveClient(): LiveHiveClient {
  const bridge = createBridgeApi();
  let signer: HiveSigner | null = null;
  let encryptionKeys: Uint8Array[] = [];
  return {
    mode: "live",
    useSigner: (next, keys) => {
      signer = next;
      encryptionKeys = next ? (keys ?? []) : [];
    },
    resume: bridge.resume,
    status: {
      health: bridge.health,
      lowBalance: async () => {
        const address = signer?.account.address ?? bridge.owner();
        if (!address) return null;
        const balance = await hivePublicClient.getBalance({ address });
        return balance < LOW_BALANCE ? `${formatEther(balance)} MON` : null;
      },
      balance: async () => {
        const address = signer?.account.address ?? bridge.owner();
        if (!address) throw new HiveError("UNAUTHORIZED", "Sign in first.");
        const balance = await hivePublicClient.getBalance({ address });
        return { mon: Number(formatEther(balance)).toFixed(4), low: balance < LOW_BALANCE };
      },
    },
    auth: bridge.auth,
    agents: bridge.agents,
    oauth: bridge.oauth,
    graph: {
      load: async (owner) => {
        const mine = await chainReader.agentsOf(owner);
        const notes = loadEdgeNotes(owner);
        // The chain keeps only keccak256(topic): the topic text comes from "general" and the old "brain", the edges signed here, then what the agents wrote.
        const known = [DEFAULT_TOPIC, "brain", ...Object.values(notes).map((n) => n.topic)];
        const written = async () => (await Promise.all(mine.map((a) => agentHistory(chainHistory, a.id).catch(() => [])))).flat().map((r) => r.topic as string);
        const edges = await edgesOf(edgeReader, mine.map((a) => a.id), known, notes, written);
        return { agents: mine.map(toAgent), edges };
      },
      auditEvents: (owner) => auditEvents(envioAudit, owner),
      provenance: (contentHash) => provenance(envioAudit, contentHash),
      ownerStats: (owner) => ownerStats(envioAudit, owner),
      identities: (owner) => agentIdentities(envioAudit, owner),
    },
    events: bridge.events,
    memory: {
      history: (agentId) => agentHistory(chainHistory, agentId),
      preview: (contentHash) => previewMemory({ fetchSealed: bridge.sealedMemory, encryptionKeys: () => encryptionKeys }, contentHash),
    },
    identity: {
      cardUrl: (agentId) => identityCardUrl(process.env.NEXT_PUBLIC_BRIDGE_URL, agentId),
    },
    tx: {
      registerIdentity(agentId) {
        const current = signer;
        const run = async () => {
          if (!current) throw new HiveError("UNAUTHORIZED", "Unlock with your passkey first.");
          return registerIdentity(chainIdentity(current), { bridgeUrl: process.env.NEXT_PUBLIC_BRIDGE_URL, agentId });
        };
        const done = run().then(
          ({ erc8004Id, txHash }) => ({ status: "confirmed" as const, txHash: zTxHash.parse(txHash), explorerUrl: explorerTx(txHash), erc8004Id }),
          (e: unknown) => ({ status: "failed" as const, error: e instanceof HiveError ? e : new HiveError("CHAIN_ERROR", "Could not add the ERC-8004 identity on Monad.") }),
        );
        return { status: "pending", wait: () => done };
      },
      registerAgent({ name, agentType, agentKey }) {
        const current = signer;
        const run = async () => {
          if (!current) throw new HiveError("UNAUTHORIZED", "Unlock with your passkey first.");
          return registerAndBind(chainRegistry(current), { owner: current.account.address, name, agentType, agentKey });
        };
        // Started now, so the call is on its way before the UI awaits it.
        const done = run().then(
          ({ agentId, txHash }) => ({ status: "confirmed" as const, txHash: zTxHash.parse(txHash), explorerUrl: explorerTx(txHash), agentId }),
          (e: unknown) => ({ status: "failed" as const, error: e instanceof HiveError ? e : new HiveError("CHAIN_ERROR", "Could not register the agent on Monad.") }),
        );
        return { status: "pending", wait: () => done };
      },
      addEdge({ from, to, topic, expiresAt }) {
        const current = signer;
        const run = async () => {
          if (!current) throw new HiveError("UNAUTHORIZED", "Unlock with your passkey first.");
          const out = await addEdgeTx(chainEdges(current), { from, to, topic, expiresAt });
          saveEdgeNote(current.account.address, out.edgeId.toString(), { topic, addedTx: out.txHash });
          return out;
        };
        const done = run().then(
          ({ edgeId, txHash }) => ({ status: "confirmed" as const, txHash: zTxHash.parse(txHash), explorerUrl: explorerTx(txHash), edgeId: zEdgeId.parse(edgeId.toString()) }),
          (e: unknown) => ({ status: "failed" as const, error: e instanceof HiveError ? e : new HiveError("CHAIN_ERROR", "Could not sign the edge on Monad.") }),
        );
        return { status: "pending", wait: () => done };
      },
      removeEdge(edgeId) {
        const current = signer;
        const run = async () => {
          if (!current) throw new HiveError("UNAUTHORIZED", "Unlock with your passkey first.");
          return removeEdgeTx(chainEdges(current), edgeId);
        };
        const done = run().then(
          (txHash) => ({ status: "confirmed" as const, txHash: zTxHash.parse(txHash), explorerUrl: explorerTx(txHash) }),
          (e: unknown) => ({ status: "failed" as const, error: e instanceof HiveError ? e : new HiveError("CHAIN_ERROR", "Could not revoke the edge on Monad.") }),
        );
        return { status: "pending", wait: () => done };
      },
    },
  };
}
