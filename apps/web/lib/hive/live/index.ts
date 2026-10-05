import type { HiveClient, TxHandle } from "../types";
import { createBridgeApi } from "./bridge";
import { agentsOf, toAgent } from "./registry";
import { chainReader } from "./registryChain";

// Sign-in and agent sessions talk to the real bridge, and agents are read from the AgentRegistry.
// Edges (Envio), live events, memory preview and edge transactions arrive in step 10, one service at a time.
const todo = (what: string): never => {
  throw new Error(`${what}: not implemented yet: see step 10`);
};
const txTodo = (what: string): TxHandle<never> => todo(what);

export function createLiveClient(): HiveClient {
  const bridge = createBridgeApi();
  return {
    mode: "live",
    status: {
      health: bridge.health,
      // Gas is sponsored (ADR-002), so there is no balance to warn about.
      lowBalance: async () => null,
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
      registerAgent: () => txTodo("tx.registerAgent"),
      addEdge: () => txTodo("tx.addEdge"),
      removeEdge: () => txTodo("tx.removeEdge"),
    },
  };
}
