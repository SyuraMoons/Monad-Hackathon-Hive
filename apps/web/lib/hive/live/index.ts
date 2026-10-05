import type { HiveClient, TxHandle } from "../types";
import { createBridgeApi } from "./bridge";

// Sign-in and agent sessions talk to the real bridge. The graph (Envio), live events, memory preview
// and transactions arrive in step 10, one service at a time.
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
      load: async () => todo("graph.load"),
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
