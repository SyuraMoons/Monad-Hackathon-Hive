import { createTestIndexer } from "envio";
import { describe, expect, it } from "vitest";

const OWNER = "0xc659000000000000000000000000000000005793";
const WRITER = "0x1111111111111111111111111111111111111111";
const HASH = "0x" + "ab".repeat(32);
const TX = (n: number) => "0x" + n.toString(16).padStart(64, "0");

type Item = Parameters<ReturnType<typeof createTestIndexer>["process"]>[0]["chains"][10143] extends infer C ? C extends { simulate?: (infer I)[] } ? I : never : never;

const START = 69_814_735; // config.yaml start_block: simulated blocks must not precede it
const tx = (n: number) => ({ hash: TX(n) });
const at = (number: number, timestamp: number) => ({ number: START + number, timestamp });

const register = (agentId: bigint, name: string, n: number): Item => ({
  contract: "AgentRegistry", event: "AgentRegistered", block: at(n, 1000 + n), transaction: tx(n),
  params: { agentId, owner: OWNER, name, agentType: "chatbot", pubKey: "0x" },
});
const edgeAdded = (edgeId: bigint, from: bigint, to: bigint, topic: string, expiresAt: bigint, n: number): Item => ({
  contract: "KnowledgeGraph", event: "EdgeAdded", block: at(n, 1000 + n), transaction: tx(n),
  params: { edgeId, from, to, topic, expiresAt, timestamp: BigInt(1000 + n) },
});
const edgeRemoved = (edgeId: bigint, n: number): Item => ({
  contract: "KnowledgeGraph", event: "EdgeRemoved", block: at(n, 1000 + n), transaction: tx(n),
  params: { edgeId, by: OWNER, timestamp: BigInt(1000 + n) },
});
const written = (slotId: bigint, agentId: bigint, topic: string, n: number, hash = HASH): Item => ({
  contract: "MemorySlots", event: "MemoryWritten", block: at(n, 1000 + n), transaction: tx(n),
  params: { slotId, agentId, contentHash: hash, topic, writtenAt: BigInt(1000 + n) },
});
const propagate = (from: bigint, to: bigint, topic: string, n: number, hash = HASH): Item => ({
  contract: "PropagationEngine", event: "Propagate", block: at(n, 1000 + n), transaction: tx(n),
  params: { from, to, contentHash: hash, topic, timestamp: BigInt(1000 + n) },
});

const run = async (simulate: Item[]) => {
  const indexer = createTestIndexer();
  await indexer.process({ chains: { 10143: { startBlock: START, simulate } } });
  return indexer;
};

describe("audit indexer", () => {
  it("indexes a write that travels along a topic edge, then a revoke", async () => {
    const far = 4_000_000_000n;
    const idx = await run([
      register(1n, "Claude", 1), register(2n, "ChatGPT", 2),
      edgeAdded(1n, 1n, 2n, "work", far, 3),
      written(7n, 1n, "work", 4), propagate(1n, 2n, "work", 4),
      edgeRemoved(1n, 5),
      written(8n, 1n, "work", 6, "0x" + "cd".repeat(32)),
    ]);

    const slot = await idx.MemorySlot.getOrThrow("7");
    expect(slot).toMatchObject({ owner: OWNER, agentId: "1", topic: "work", propagatedCount: 1 });
    expect((await idx.MemorySlot.getOrThrow("8")).propagatedCount).toBe(0);

    const edge = await idx.Edge.getOrThrow("1");
    expect(edge).toMatchObject({ active: false, topic: "work", fromAgent: "1", toAgent: "2", propagationCount: 1, lifetimeSeconds: 2 });

    const audit = await idx.AuditEvent.getAll();
    expect(audit.map((e) => e.kind).sort()).toEqual(
      ["agent.registered", "agent.registered", "edge.added", "edge.removed", "memory.propagated", "memory.written", "memory.written"],
    );
    expect(audit.find((e) => e.kind === "edge.removed")).toMatchObject({ fromAgent: "1", toAgent: "2", topic: "work" });
    expect(audit.find((e) => e.id === "memory.written:7")?.propagatedCount).toBe(1);

    expect(await idx.OwnerStats.getOrThrow(OWNER)).toMatchObject({ agents: 2, edgesAdded: 1, edgesRevoked: 1, memories: 2, propagations: 1, violations: 0 });
    expect(await idx.PolicyViolation.getAll()).toEqual([]);
    expect(await idx.AgentStats.getOrThrow("2")).toMatchObject({ received: 1, edgesIn: 0 });
    expect(await idx.TopicStats.getOrThrow(`${OWNER}:work`)).toMatchObject({ edges: 1, writes: 2, propagations: 1 });
  });

  it("credits an all-topics edge", async () => {
    const idx = await run([
      register(1n, "A", 1), register(2n, "B", 2),
      edgeAdded(1n, 1n, 2n, "*", 4_000_000_000n, 3),
      written(1n, 1n, "anything", 4), propagate(1n, 2n, "anything", 4),
    ]);
    expect((await idx.Edge.getOrThrow("1")).propagationCount).toBe(1);
    expect((await idx.PolicyViolation.getAll()).length).toBe(0);
  });

  it("gives each duplicate edge its own Propagate log", async () => {
    const idx = await run([
      register(1n, "A", 1), register(2n, "B", 2),
      edgeAdded(1n, 1n, 2n, "work", 4_000_000_000n, 3), edgeAdded(2n, 1n, 2n, "*", 4_000_000_000n, 3),
      written(1n, 1n, "work", 4), propagate(1n, 2n, "work", 4), propagate(1n, 2n, "work", 4),
    ]);
    expect((await idx.Edge.getOrThrow("1")).propagationCount).toBe(1);
    expect((await idx.Edge.getOrThrow("2")).propagationCount).toBe(1);
    expect((await idx.MemorySlot.getOrThrow("1")).propagatedCount).toBe(2);
  });

  it("records a violation when a delivery has no active edge", async () => {
    const idx = await run([
      register(1n, "A", 1), register(2n, "B", 2),
      edgeAdded(1n, 1n, 2n, "work", 4_000_000_000n, 3), edgeRemoved(1n, 4),
      written(1n, 1n, "work", 5), propagate(1n, 2n, "work", 5),
    ]);
    const v = await idx.PolicyViolation.getAll();
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ reason: "no_active_edge", fromAgent: "1", toAgent: "2" });
    expect((await idx.OwnerStats.getOrThrow(OWNER)).violations).toBe(1);
  });

  it("treats an expired edge as no edge (expiresAt equal to now is expired)", async () => {
    const idx = await run([
      register(1n, "A", 1), register(2n, "B", 2),
      edgeAdded(1n, 1n, 2n, "work", 1004n, 3),
      written(1n, 1n, "work", 4), propagate(1n, 2n, "work", 4),
    ]);
    expect((await idx.PolicyViolation.getAll()).length).toBe(1);
  });

  it("records the writer key on the agent", async () => {
    const idx = await run([
      register(1n, "A", 1),
      { contract: "AgentRegistry", event: "AgentWriterSet", block: at(2, 1002), transaction: tx(2), params: { agentId: 1n, writer: WRITER } },
    ]);
    expect((await idx.Agent.getOrThrow("1")).writer).toBe(WRITER);
  });
});
