import { describe, expect, it, vi } from "vitest";

// The store only reaches the client from load(), which these tests don't call.
vi.mock("@/lib/hive/client", () => ({ getHiveClient: vi.fn() }));

import { useGraph, visibleAgents, type AgentNode, type EdgeView } from "./graph";

const agent = (id: number): AgentNode =>
  ({ agentId: BigInt(id), name: `agent-${id}`, agentType: "claude", connected: false, lastCallAt: null, tokenExpiresAt: null }) as AgentNode;
const edge = (from: number, to: number, state: EdgeView["state"]): EdgeView =>
  ({ key: `${from}-${to}`, from: BigInt(from), to: BigInt(to), topic: "work", state }) as EdgeView;

function seed(edges: EdgeView[] = []) {
  useGraph.setState({ agents: { "1": agent(1), "2": agent(2) }, edges: Object.fromEntries(edges.map((e) => [e.key, e])), hidden: {} });
}

describe("hiding an agent", () => {
  it("hides an agent with no edges and keeps it in the full list", () => {
    seed();
    expect(useGraph.getState().hide(BigInt(1))).toEqual({ ok: true });
    const { agents, hidden } = useGraph.getState();
    expect(Object.keys(visibleAgents(agents, hidden))).toEqual(["2"]);
    expect(Object.keys(agents)).toEqual(["1", "2"]);
  });

  it("refuses while the agent has a signed, pending or revoking edge, from either side", () => {
    for (const state of ["signed", "pending", "revoking"] as const) {
      seed([edge(2, 1, state)]);
      expect(useGraph.getState().hide(BigInt(1))).toHaveProperty("error");
      expect(useGraph.getState().hidden).toEqual({});
    }
  });

  it("allows it once the edge is revoked", () => {
    seed([edge(1, 2, "revoked")]);
    expect(useGraph.getState().hide(BigInt(1))).toEqual({ ok: true });
  });

  it("shows the agent again after unhide", () => {
    seed();
    useGraph.getState().hide(BigInt(1));
    useGraph.getState().unhide(BigInt(1));
    expect(useGraph.getState().hidden).toEqual({});
  });
});
