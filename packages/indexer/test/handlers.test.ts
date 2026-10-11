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

  describe("ERC-8004 identity (ADR-028)", () => {
    const REGISTRY = "0x06f4401cf289bfc29de59fc1b624096dc69ff25b";
    const STRANGER = "0x2222222222222222222222222222222222222222";
    const word = (hex: string) => hex.replace(/^0x/, "").padStart(64, "0");
    const ref = (agentId: bigint, registry = REGISTRY): `0x${string}` => `0x${word(registry)}${word(agentId.toString(16))}`;
    const identity = (erc8004Id: bigint, owner: `0x${string}`, n: number): Item => ({
      contract: "Erc8004IdentityRegistry", event: "Registered", block: at(n, 1000 + n), transaction: tx(n),
      params: { agentId: erc8004Id, agentURI: `https://bridge.example.com/agents/${erc8004Id}/card.json`, owner },
    });
    const metadata = (erc8004Id: bigint, value: `0x${string}`, n: number, key = "hiveAgentId"): Item => ({
      contract: "Erc8004IdentityRegistry", event: "MetadataSet", block: at(n, 1000 + n), transaction: tx(n),
      params: { agentId: erc8004Id, indexedMetadataKey: key, metadataKey: key, metadataValue: value },
    });

    it("joins an identity to the agent when both have the same owner", async () => {
      const idx = await run([register(1n, "Claude", 1), identity(2142n, OWNER, 2), metadata(2142n, ref(1n), 2)]);
      expect(await idx.Erc8004Identity.getOrThrow("2142")).toMatchObject({ owner: OWNER, hiveAgentId: "1", agentURI: "https://bridge.example.com/agents/2142/card.json", registeredTx: TX(2) });
      expect((await idx.Agent.getOrThrow("1")).erc8004Id).toBe("2142");
    });

    it("keeps a stranger's identity but does not join it to our agent", async () => {
      const idx = await run([register(1n, "Claude", 1), identity(2142n, STRANGER, 2), metadata(2142n, ref(1n), 2)]);
      expect((await idx.Erc8004Identity.getOrThrow("2142")).hiveAgentId).toBeUndefined();
      expect((await idx.Agent.getOrThrow("1")).erc8004Id).toBeUndefined();
    });

    it("ignores a reference to another registry, an unknown agent, a malformed value and other keys", async () => {
      const idx = await run([
        register(1n, "Claude", 1), identity(2142n, OWNER, 2),
        metadata(2142n, ref(1n, "0x3333333333333333333333333333333333333333"), 3),
        metadata(2142n, ref(99n), 4),
        metadata(2142n, "0x01", 5),
        metadata(2142n, ref(1n), 6, "agentWallet"),
      ]);
      expect((await idx.Erc8004Identity.getOrThrow("2142")).hiveAgentId).toBeUndefined();
      expect((await idx.Agent.getOrThrow("1")).erc8004Id).toBeUndefined();
    });

    it("does not join an identity it never saw registered", async () => {
      const idx = await run([register(1n, "Claude", 1), metadata(5n, ref(1n), 2)]);
      expect((await idx.Agent.getOrThrow("1")).erc8004Id).toBeUndefined();
    });

    it("keeps the first identity on the agent when the owner registers a second one", async () => {
      const idx = await run([register(1n, "Claude", 1), identity(2142n, OWNER, 2), metadata(2142n, ref(1n), 2), identity(2150n, OWNER, 3), metadata(2150n, ref(1n), 3)]);
      expect((await idx.Agent.getOrThrow("1")).erc8004Id).toBe("2142");
      expect((await idx.Erc8004Identity.getOrThrow("2150")).hiveAgentId).toBe("1");
    });

    it("leaves the audit rows and the counters alone", async () => {
      const idx = await run([register(1n, "Claude", 1), identity(2142n, OWNER, 2), metadata(2142n, ref(1n), 2)]);
      expect((await idx.AuditEvent.getAll()).map((e) => e.kind)).toEqual(["agent.registered"]);
      expect(await idx.OwnerStats.getOrThrow(OWNER)).toMatchObject({ agents: 1 });
    });
  });
});
