import { describe, expect, it, vi, beforeEach } from "vitest";
import type { HiveError } from "@hive/shared";

vi.mock("@/lib/hive/client", () => ({ getHiveClient: vi.fn() }));
vi.mock("@/lib/stores/session", () => ({ useSession: { getState: () => ({ mode: "mock", unlock: vi.fn() }) } }));

import { revokeEdge, signEdge } from "./edgeActions";
import { useFeed } from "@/lib/stores/feed";
import { useGraph, type AgentNode } from "@/lib/stores/graph";
import { useUi } from "@/lib/stores/ui";

const A = BigInt(1);
const B = BigInt(2);
const agent = (id: bigint, name: string) => ({ agentId: id, name, agentType: "claude" }) as AgentNode;
const ok = (n: number) => ({ status: "confirmed" as const, txHash: `0x${String(n).repeat(64)}`, explorerUrl: `https://scan/tx/${n}`, edgeId: BigInt(n) });
const failed = (message: string) => ({ status: "failed" as const, error: { code: "CHAIN_ERROR", message } as HiveError });
const input = { from: A, to: B, topic: "work" as never, expiresAt: 2_000_000_000, update: false };
const lastToast = () => useUi.getState().toasts.at(-1)!;

const removed = (n: number) => ({ status: "confirmed" as const, txHash: `0x${String(n).repeat(64)}`, explorerUrl: `https://scan/rm/${n}` });
const signed = (id: number, o: Record<string, unknown> = {}) => ({ key: String(id), edgeId: BigInt(id), from: A, to: B, topic: "work", state: "signed", ...o });

let addEdge: ReturnType<typeof vi.fn>;
let removeEdge: ReturnType<typeof vi.fn>;
beforeEach(() => {
  addEdge = vi.fn();
  removeEdge = vi.fn();
  useUi.setState({ toasts: [], edgeEditor: null });
  useFeed.setState({ rows: [] });
  useGraph.setState({ agents: { "1": agent(A, "Claude"), "2": agent(B, "GPT") }, edges: {}, addEdge, removeEdge } as never);
});

describe("signEdge", () => {
  it("signs one edge by default", async () => {
    addEdge.mockResolvedValueOnce(ok(1));
    await signEdge(input);
    expect(addEdge).toHaveBeenCalledTimes(1);
    expect(addEdge).toHaveBeenCalledWith({ from: A, to: B, topic: "work", expiresAt: 2_000_000_000 });
    expect(lastToast()).toMatchObject({ status: "success", message: expect.stringContaining("Edge signed") });
  });

  it("signs both directions in order and reports once", async () => {
    addEdge.mockResolvedValueOnce(ok(1)).mockResolvedValueOnce(ok(2));
    await signEdge({ ...input, both: true });
    expect(addEdge.mock.calls.map(([c]) => [c.from, c.to])).toEqual([[A, B], [B, A]]);
    expect(useUi.getState().toasts).toHaveLength(1);
    expect(lastToast()).toMatchObject({ status: "success", message: expect.stringContaining("Edges signed"), link: { href: "https://scan/tx/2" } });
  });

  it("does not try the reverse edge when the first fails", async () => {
    addEdge.mockResolvedValueOnce(failed("no gas"));
    await signEdge({ ...input, both: true });
    expect(addEdge).toHaveBeenCalledTimes(1);
    expect(lastToast()).toMatchObject({ status: "error", message: expect.stringContaining("no gas") });
  });

  it("says which direction is signed when the second fails", async () => {
    addEdge.mockResolvedValueOnce(ok(1)).mockResolvedValueOnce(failed("reverted"));
    await signEdge({ ...input, both: true });
    const t = lastToast();
    expect(t.status).toBe("error");
    expect(t.message).toContain("Claude → GPT is signed");
    expect(t.message).toContain("GPT → Claude failed");
    expect(t.link?.href).toBe("https://scan/tx/1");
  });

  it("calls it an update only when every edge it signs already existed", async () => {
    useGraph.setState({
      edges: {
        "7": { key: "7", from: B, to: A, topic: "work", state: "signed" },
      } as never,
    });
    addEdge.mockResolvedValueOnce(ok(1)).mockResolvedValueOnce(ok(2));
    await signEdge({ ...input, both: true, update: false });
    expect(lastToast().message).toContain("Edges signed");
    addEdge.mockResolvedValueOnce(ok(3)).mockResolvedValueOnce(ok(4));
    await signEdge({ ...input, both: true, update: true });
    expect(lastToast().message).toContain("Expiry updated");
  });
});

describe("signEdge over a live edge", () => {
  it("revokes the old edge first, then signs the new one", async () => {
    useGraph.setState({ edges: { "5": signed(5) } as never });
    removeEdge.mockResolvedValueOnce(removed(5));
    addEdge.mockResolvedValueOnce(ok(6));
    await signEdge({ ...input, update: true });
    expect(removeEdge).toHaveBeenCalledWith("5");
    expect(removeEdge.mock.invocationCallOrder[0]).toBeLessThan(addEdge.mock.invocationCallOrder[0]);
    expect(useUi.getState().toasts).toHaveLength(1);
    expect(lastToast()).toMatchObject({ status: "success", message: expect.stringContaining("Expiry updated"), link: { href: "https://scan/tx/6" } });
  });

  it("revokes every live twin, and only the ones with the same topic", async () => {
    useGraph.setState({ edges: { "5": signed(5), "8": signed(8), "9": signed(9, { topic: "*" }), "10": signed(10, { topic: "personal" }) } as never });
    removeEdge.mockResolvedValue(removed(1));
    addEdge.mockResolvedValueOnce(ok(11));
    await signEdge({ ...input, update: true });
    expect(removeEdge.mock.calls.map(([k]) => k)).toEqual(["5", "8"]);
  });

  it("does not sign a new edge when the revoke fails, and says the old one may still be live", async () => {
    useGraph.setState({ edges: { "5": signed(5) } as never });
    removeEdge.mockResolvedValueOnce(failed("rejected"));
    await signEdge({ ...input, update: true });
    expect(addEdge).not.toHaveBeenCalled();
    expect(lastToast()).toMatchObject({ status: "error", message: expect.stringContaining("The old edge may still be live") });
  });

  it("says the old edge is gone when the new one fails to sign", async () => {
    useGraph.setState({ edges: { "5": signed(5) } as never });
    removeEdge.mockResolvedValueOnce(removed(5));
    addEdge.mockResolvedValueOnce(failed("reverted"));
    await signEdge({ ...input, update: true });
    expect(lastToast()).toMatchObject({ status: "error", message: expect.stringContaining("The old edge was revoked, sign it again") });
  });

  it("replaces each direction of a mutual edge, leg by leg", async () => {
    useGraph.setState({ edges: { "5": signed(5), "6": signed(6, { from: B, to: A }) } as never });
    removeEdge.mockResolvedValue(removed(1));
    addEdge.mockResolvedValueOnce(ok(7)).mockResolvedValueOnce(ok(8));
    await signEdge({ ...input, update: true, both: true });
    const order = [...removeEdge.mock.invocationCallOrder.map((n, i) => [n, `rm${removeEdge.mock.calls[i][0]}`] as const), ...addEdge.mock.invocationCallOrder.map((n, i) => [n, `add${addEdge.mock.calls[i][0].from}`] as const)];
    expect(order.sort((x, y) => x[0] - y[0]).map(([, what]) => what)).toEqual(["rm5", "add1", "rm6", "add2"]);
    expect(lastToast()).toMatchObject({ status: "success", message: expect.stringContaining("Expiry updated") });
  });

  it("names the direction that failed to replace when the second leg's revoke fails", async () => {
    useGraph.setState({ edges: { "5": signed(5), "6": signed(6, { from: B, to: A }) } as never });
    removeEdge.mockResolvedValueOnce(removed(5)).mockResolvedValueOnce(failed("rejected"));
    addEdge.mockResolvedValueOnce(ok(7));
    await signEdge({ ...input, update: true, both: true });
    const t = lastToast();
    expect(t.message).toContain("Claude → GPT is signed");
    expect(t.message).toContain("GPT → Claude failed");
    expect(t.message).toContain("The old edge may still be live");
    expect(addEdge).toHaveBeenCalledTimes(1);
  });
});

describe("revokeEdge", () => {
  it("revokes an edge on its own when it has no twin", async () => {
    useGraph.setState({ edges: { "5": signed(5) } as never });
    removeEdge.mockResolvedValueOnce(removed(5));
    await revokeEdge("5");
    expect(removeEdge.mock.calls).toEqual([["5"]]);
    expect(lastToast()).toMatchObject({ status: "revoked", message: expect.stringContaining("Edge revoked") });
    expect(useFeed.getState().rows).toHaveLength(1);
  });

  it("revokes identical edges together, under one toast with a feed row each", async () => {
    useGraph.setState({ edges: { "5": signed(5), "8": signed(8), "9": signed(9, { topic: "personal" }) } as never });
    removeEdge.mockResolvedValueOnce(removed(1)).mockResolvedValueOnce(removed(2));
    await revokeEdge("8");
    expect(removeEdge.mock.calls.map(([k]) => k)).toEqual(["8", "5"]);
    expect(useUi.getState().toasts).toHaveLength(1);
    expect(lastToast()).toMatchObject({ status: "revoked", message: expect.stringContaining("2 identical edges revoked"), link: { href: "https://scan/rm/2" } });
    expect(useFeed.getState().rows).toHaveLength(2);
  });

  it("says how many went when one of them fails, and keeps the link of the last that did", async () => {
    useGraph.setState({ edges: { "5": signed(5), "8": signed(8) } as never });
    removeEdge.mockResolvedValueOnce(removed(1)).mockResolvedValueOnce(failed("rejected"));
    await revokeEdge("5");
    expect(lastToast()).toMatchObject({ status: "error", message: expect.stringContaining("Revoked 1 of 2 identical edges"), link: { href: "https://scan/rm/1" } });
    expect(useFeed.getState().rows).toHaveLength(1);
  });

  it("does nothing for an edge that is not signed", async () => {
    useGraph.setState({ edges: { "5": signed(5, { state: "pending" }) } as never });
    await revokeEdge("5");
    expect(removeEdge).not.toHaveBeenCalled();
  });
});
