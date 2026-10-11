import { HiveError, zContentHash } from "@hive/shared";
import { describe, expect, it, vi } from "vitest";
import { auditEvents, ownerStats, provenance, type AuditDeps } from "./audit";
import { envioAudit } from "./auditEnvio";

const tx = (n: number) => `0x${n.toString(16).padStart(2, "0").repeat(32)}`;
const hash = tx(0xab);
const blank = { agentId: null, name: null, agentType: null, edgeId: null, fromAgent: null, toAgent: null, topic: null, expiresAt: null, slotId: null, contentHash: null, propagatedCount: null };
const deps = (data: unknown): AuditDeps & { query: ReturnType<typeof vi.fn> } => ({ query: vi.fn(async () => data) }) as never;

describe("auditEvents", () => {
  it("asks for the lowercased owner and maps every kind, keeping the indexer's order", async () => {
    const d = deps({
      AuditEvent: [
        { ...blank, kind: "memory.propagated", at: 50, txHash: tx(5), slotId: "7", fromAgent: "1", toAgent: "2", contentHash: hash, topic: "work" },
        { ...blank, kind: "memory.written", at: 50, txHash: tx(5), slotId: "7", agentId: "1", contentHash: hash, topic: "work", propagatedCount: 1 },
        { ...blank, kind: "edge.removed", at: 40, txHash: tx(4), edgeId: "3", fromAgent: "1", toAgent: "2", topic: "work" },
        { ...blank, kind: "edge.added", at: 30, txHash: tx(3), edgeId: "3", fromAgent: "1", toAgent: "2", topic: "*", expiresAt: 4_000_000_000 },
        { ...blank, kind: "agent.registered", at: 20, txHash: tx(2), agentId: "1", name: "Claude", agentType: "claude" },
      ],
    });
    const events = await auditEvents(d, "0xABCDEF0000000000000000000000000000000001");
    expect(d.query).toHaveBeenCalledWith(expect.stringContaining("AuditEvent"), { owner: "0xabcdef0000000000000000000000000000000001", limit: 500 });
    expect(events.map((e) => e.kind)).toEqual(["memory.propagated", "memory.written", "edge.removed", "edge.added", "agent.registered"]);
    expect(events[1]).toMatchObject({ kind: "memory.written", slotId: BigInt(7), agentId: BigInt(1), propagatedCount: 1 });
    expect(events[2]).toMatchObject({ kind: "edge.removed", from: BigInt(1), to: BigInt(2), topic: "work" });
    expect(events[3]).toMatchObject({ kind: "edge.added", topic: "*" });
  });

  it("skips rows the page can't show: unknown kind, missing slot, bad hash", async () => {
    const events = await auditEvents(
      deps({
        AuditEvent: [
          { ...blank, kind: "something.new", at: 1, txHash: tx(1) },
          { ...blank, kind: "memory.propagated", at: 1, txHash: tx(1), slotId: null, fromAgent: "1", toAgent: "2", contentHash: hash, topic: "work" },
          { ...blank, kind: "memory.written", at: 1, txHash: "0x12", slotId: "1", agentId: "1", contentHash: hash, topic: "work", propagatedCount: 0 },
          { ...blank, kind: "agent.registered", at: 1, txHash: tx(1), agentId: "1", name: "Claude", agentType: "chatbot" },
        ],
      }),
      "0x1",
    );
    expect(events.map((e) => e.kind)).toEqual(["agent.registered"]);
  });

  it("shows an agent type the app doesn't know as other instead of dropping the registration", async () => {
    const events = await auditEvents(deps({ AuditEvent: [{ ...blank, kind: "agent.registered", at: 1, txHash: tx(1), agentId: "1", name: "Old", agentType: "chatbot" }] }), "0x1");
    expect(events).toEqual([expect.objectContaining({ kind: "agent.registered", agentType: "other" })]);
  });

  it("returns an empty list for an owner with no history", async () => {
    expect(await auditEvents(deps({ AuditEvent: [] }), "0x1")).toEqual([]);
  });

  it("passes an indexer failure through", async () => {
    const failing: AuditDeps = { query: async () => { throw new HiveError("INTERNAL", "down"); } };
    await expect(auditEvents(failing, "0x1")).rejects.toMatchObject({ code: "INTERNAL" });
  });
});

describe("provenance", () => {
  const slot = { id: "7", agentId: "1", contentHash: hash, topic: "work", propagatedCount: 1, txHash: tx(5), writtenAt: 50 };

  it("returns the slot and where it went, filling a missing slot id from the slot", async () => {
    const d = deps({ MemorySlot: [slot], Propagation: [{ slotId: null, fromAgent: "1", toAgent: "2", contentHash: hash, topic: "work", txHash: tx(5), at: 50 }] });
    const p = await provenance(d, zContentHash.parse(hash));
    expect(d.query).toHaveBeenCalledWith(expect.stringContaining("MemorySlot"), { hash });
    expect(p?.slot).toMatchObject({ slotId: BigInt(7), agentId: BigInt(1), topic: "work", propagatedCount: 1, writtenAt: 50 });
    expect(p?.propagations).toEqual([expect.objectContaining({ slotId: BigInt(7), from: BigInt(1), to: BigInt(2), at: 50 })]);
  });

  it("is null when the indexer has no such slot", async () => {
    expect(await provenance(deps({ MemorySlot: [], Propagation: [] }), zContentHash.parse(hash))).toBeNull();
  });

  it("is null when the indexed row doesn't match the shared schema", async () => {
    expect(await provenance(deps({ MemorySlot: [{ ...slot, txHash: "nope" }], Propagation: [] }), zContentHash.parse(hash))).toBeNull();
  });
});

describe("ownerStats", () => {
  const row = { agents: 2, edgesAdded: 3, edgesRevoked: 1, memories: 4, propagations: 5, violations: 0 };

  it("asks for the lowercased owner and returns the counters", async () => {
    const d = deps({ OwnerStats: [row] });
    expect(await ownerStats(d, "0xABC")).toEqual(row);
    expect(d.query).toHaveBeenCalledWith(expect.stringContaining("OwnerStats"), { owner: "0xabc" });
  });

  it("reads as zeros for an owner the indexer has not seen", async () => {
    expect(await ownerStats(deps({ OwnerStats: [] }), "0x1")).toEqual({ agents: 0, edgesAdded: 0, edgesRevoked: 0, memories: 0, propagations: 0, violations: 0 });
  });

  it("rejects stats that don't match the shared schema", async () => {
    await expect(ownerStats(deps({ OwnerStats: [{ ...row, violations: -1 }] }), "0x1")).rejects.toMatchObject({ code: "INTERNAL" });
  });
});

describe("envioAudit", () => {
  const withUrl = (url: string | undefined, run: () => Promise<void>) => async () => {
    const before = process.env.NEXT_PUBLIC_ENVIO_URL;
    if (url === undefined) delete process.env.NEXT_PUBLIC_ENVIO_URL; else process.env.NEXT_PUBLIC_ENVIO_URL = url;
    try { await run(); } finally { if (before === undefined) delete process.env.NEXT_PUBLIC_ENVIO_URL; else process.env.NEXT_PUBLIC_ENVIO_URL = before; vi.unstubAllGlobals(); }
  };

  it("fails clearly when the endpoint is not configured", withUrl(undefined, async () => {
    await expect(envioAudit.query("{ x }", {})).rejects.toThrow(/NEXT_PUBLIC_ENVIO_URL/);
  }));

  it("posts the query and returns data", withUrl("https://envio.test/v1/graphql", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { ok: 1 } })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await envioAudit.query("{ x }", { a: 1 })).toEqual({ ok: 1 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://envio.test/v1/graphql");
    expect(JSON.parse(init.body as string)).toEqual({ query: "{ x }", variables: { a: 1 } });
  }));

  it("rejects GraphQL errors and non-200 answers", withUrl("https://envio.test/v1/graphql", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ errors: [{ message: "bad" }] }))));
    await expect(envioAudit.query("{ x }", {})).rejects.toMatchObject({ code: "INTERNAL" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 502 })));
    await expect(envioAudit.query("{ x }", {})).rejects.toThrow(/502/);
  }));
});
