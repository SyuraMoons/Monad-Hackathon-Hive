import { HiveError } from "@hive/shared";
import { describe, expect, it, vi } from "vitest";

// The store reaches the client from load(), which these tests don't call, and from the transactions, which get a fake.
vi.mock("@/lib/hive/client", () => ({ getHiveClient: vi.fn() }));

import { getHiveClient } from "@/lib/hive/client";
import { displayName, useGraph, visibleAgents, type AgentNode, type EdgeView } from "./graph";

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

describe("agent labels", () => {
  it("shows the label instead of the registered name, and keeps the name", () => {
    seed();
    useGraph.setState({ labels: {} });
    useGraph.getState().setLabel(BigInt(1), "  my   backend ");
    const { agents, labels } = useGraph.getState();
    expect(labels).toEqual({ "1": "my backend" });
    expect(displayName(agents["1"], labels)).toBe("my backend");
    expect(displayName(agents["2"], labels)).toBe("agent-2");
    expect(agents["1"].name).toBe("agent-1");
  });

  it("clears a label when it is set empty", () => {
    seed();
    useGraph.setState({ labels: { "1": "x" } });
    useGraph.getState().setLabel(BigInt(1), "   ");
    expect(useGraph.getState().labels).toEqual({});
  });
});

describe("ERC-8004 identity", () => {
  const TX = `0x${"ab".repeat(32)}`;
  const clientWith = (result: object) => vi.mocked(getHiveClient).mockResolvedValue({ tx: { registerIdentity: vi.fn(() => ({ status: "pending", wait: async () => result })) } } as never);

  it("remembers the id and the transaction once the receipt is in", async () => {
    seed();
    useGraph.setState({ identities: {} });
    clientWith({ status: "confirmed", txHash: TX, explorerUrl: "https://explorer.test/tx", erc8004Id: BigInt(2142) });
    expect((await useGraph.getState().addIdentity(BigInt(1))).status).toBe("confirmed");
    expect(useGraph.getState().identities).toEqual({ "1": { erc8004Id: "2142", txHash: TX } });
  });

  it("records nothing when the transaction fails", async () => {
    seed();
    useGraph.setState({ identities: {} });
    clientWith({ status: "failed", error: new HiveError("CHAIN_ERROR", "Could not add the ERC-8004 identity on Monad.") });
    expect((await useGraph.getState().addIdentity(BigInt(1))).status).toBe("failed");
    expect(useGraph.getState().identities).toEqual({});
  });
});
