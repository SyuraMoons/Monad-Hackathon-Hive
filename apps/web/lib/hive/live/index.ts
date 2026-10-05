import { HiveError, zTxHash } from "@hive/shared";
import { formatEther, parseEther } from "viem";
import { explorerTx } from "@/lib/explorer";
import { hivePublicClient } from "../clients";
import type { HiveSigner } from "../signer";
import type { HiveClient, TxHandle } from "../types";
import { createBridgeApi } from "./bridge";
import { agentsOf, registerAndBind, toAgent } from "./registry";
import { chainReader, chainRegistry } from "./registryChain";

// Sign-in and agent sessions talk to the real bridge, and agents are read from the AgentRegistry.
// Edges (Envio), live events, memory preview and edge transactions arrive in step 10, one service at a time.
const todo = (what: string): never => {
  throw new Error(`${what}: not implemented yet: see step 10`);
};
const txTodo = (what: string): TxHandle<never> => todo(what);

/** The owner's Mera account pays gas (ADR-006), so below this the edge editor points to the faucet. */
const LOW_BALANCE = parseEther("0.05");

export type LiveHiveClient = HiveClient & {
  /** The signed-in owner's signer, set by the session store after sign-in and cleared on sign-out. Memory only. */
  useSigner(signer: HiveSigner | null): void;
};

export function createLiveClient(): LiveHiveClient {
  const bridge = createBridgeApi();
  let signer: HiveSigner | null = null;
  return {
    mode: "live",
    useSigner: (next) => {
      signer = next;
    },
    status: {
      health: bridge.health,
      lowBalance: async () => {
        if (!signer) return null;
        const balance = await hivePublicClient.getBalance({ address: signer.account.address });
        return balance < LOW_BALANCE ? `${formatEther(balance)} MON` : null;
      },
      balance: async () => {
        if (!signer) throw new HiveError("UNAUTHORIZED", "Sign in first.");
        const balance = await hivePublicClient.getBalance({ address: signer.account.address });
        return { mon: Number(formatEther(balance)).toFixed(4), low: balance < LOW_BALANCE };
      },
    },
    auth: bridge.auth,
    agents: bridge.agents,
    graph: {
      // Edges stay empty until the edge wiring step: the chain keeps only keccak256(topic), so reads alone can't rebuild them.
      load: async (owner) => ({ agents: (await agentsOf(chainReader, owner)).map(toAgent), edges: [] }),
      auditEvents: async () => todo("graph.auditEvents"),
      provenance: async () => todo("graph.provenance"),
    },
    events: {
// No stream yet (step 10): report it as offline instead of throwing inside the app shell.
      subscribe: (_onEvent, onStatus) => {
        onStatus?.("offline");
        return () => {};
      },
    },
    memory: {
      preview: async () => todo("memory.preview"),
    },
    tx: {
      registerAgent({ name, agentType, agentKey }) {
        const current = signer;
        const run = async () => {
          if (!current) throw new HiveError("UNAUTHORIZED", "Sign in first.");
          return registerAndBind(chainRegistry(current), { owner: current.account.address, name, agentType, agentKey });
        };
        // Started now, so the call is on its way before the UI awaits it.
        const done = run().then(
          ({ agentId, txHash }) => ({ status: "confirmed" as const, txHash: zTxHash.parse(txHash), explorerUrl: explorerTx(txHash), agentId }),
          (e: unknown) => ({ status: "failed" as const, error: e instanceof HiveError ? e : new HiveError("CHAIN_ERROR", "Could not register the agent on Monad.") }),
        );
        return { status: "pending", wait: () => done };
      },
      addEdge: () => txTodo("tx.addEdge"),
      removeEdge: () => txTodo("tx.removeEdge"),
    },
  };
}
