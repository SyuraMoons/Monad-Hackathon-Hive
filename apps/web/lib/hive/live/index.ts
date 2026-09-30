import type { HiveClient, TxHandle } from "../types";

// The real bridge, Envio and chain arrive in step 10, one service at a time.
const todo = (what: string): never => {
  throw new Error(`${what}: not implemented yet: see step 10`);
};
const txTodo = (what: string): TxHandle<never> => todo(what);

export function createLiveClient(): HiveClient {
  return {
    mode: "live",
    status: {
      health: async () => todo("status.health"),
    },
    auth: {
      challenge: async () => todo("auth.challenge"),
      verify: async () => todo("auth.verify"),
      signOut: async () => todo("auth.signOut"),
    },
    agents: {
      list: async () => todo("agents.list"),
      authorize: async () => todo("agents.authorize"),
      disconnect: async () => todo("agents.disconnect"),
    },
    graph: {
      load: async () => todo("graph.load"),
      auditEvents: async () => todo("graph.auditEvents"),
      provenance: async () => todo("graph.provenance"),
    },
    events: {
      subscribe: () => todo("events.subscribe"),
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
