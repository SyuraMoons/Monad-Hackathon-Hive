import { describe, expect, it, vi, beforeEach } from "vitest";
import type { HiveError } from "@hive/shared";

vi.mock("@/lib/hive/client", () => ({ getHiveClient: vi.fn() }));
vi.mock("@/lib/stores/session", () => ({ useSession: { getState: () => ({ mode: "mock", unlock: vi.fn() }) } }));

import { signEdge } from "./edgeActions";
import { useGraph, type AgentNode } from "@/lib/stores/graph";
import { useUi } from "@/lib/stores/ui";

const A = BigInt(1);
const B = BigInt(2);
const agent = (id: bigint, name: string) => ({ agentId: id, name, agentType: "claude" }) as AgentNode;
const ok = (n: number) => ({ status: "confirmed" as const, txHash: `0x${String(n).repeat(64)}`, explorerUrl: `https://scan/tx/${n}`, edgeId: BigInt(n) });
const failed = (message: string) => ({ status: "failed" as const, error: { code: "CHAIN_ERROR", message } as HiveError });
const input = { from: A, to: B, topic: "work" as never, expiresAt: 2_000_000_000, update: false };
const lastToast = () => useUi.getState().toasts.at(-1)!;

let addEdge: ReturnType<typeof vi.fn>;
beforeEach(() => {
  addEdge = vi.fn();
  useUi.setState({ toasts: [], edgeEditor: null });
  useGraph.setState({ agents: { "1": agent(A, "Claude"), "2": agent(B, "GPT") }, edges: {}, addEdge } as never);
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
