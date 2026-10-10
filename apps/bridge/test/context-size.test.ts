import { encrypt } from "@hive/crypto";
import { sealDoc, type Hex } from "@hive/shared";
import { describe, expect, it } from "vitest";
import { listMemory, readMemory, type ReadDeps } from "../src/memory.js";
import { topicHash } from "../src/permissions.js";
import { searchMemory } from "../src/search.js";
import { DocCache } from "../src/sessions.js";
import { InMemoryChain, InMemoryCiphertextStore } from "../src/stubs.js";

// How much an agent's context grows to start a task (ADR-022). Bytes of the JSON a tool returns stand in for tokens.
// A seeded in-memory fixture, not a live run: it shows the shape of the saving, and the roadmap records it as such.

const KEY = ("0x" + "33".repeat(32)) as Hex;
const NOW = 1_000_000n;
const size = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)).length;

const TOPICS = ["web", "bridge", "contracts", "demo"];
const body = (n: number, topic: string) =>
  `Notes on ${topic}, item ${n}. ` + "The team discussed the rollout, the open questions and who owns the next step, with details about the interface and the failure modes we saw in testing. ".repeat(8);

describe("context size of the agent loop", () => {
  it("the new loop loads a fraction of what a bare read loaded", async () => {
    const chain = new InMemoryChain();
    const store = new InMemoryCiphertextStore();
    for (const [id, name] of [[1n, "Claude"], [2n, "ChatGPT"]] as const) chain.agents.set(id, { id, name, owner: "0x0000000000000000000000000000000000000001", agentType: "other", writer: "0x0000000000000000000000000000000000000000" });
    chain.edges.push({ id: 1n, from: 1n, to: 2n, topicHash: topicHash("*"), expiresAt: NOW + 1000n, active: true });
    let id = 1n;
    const put = async (doc: Parameters<typeof sealDoc>[0], topic: string) => {
      const sealed = await encrypt(sealDoc(doc), KEY);
      await store.put(sealed.contentHash, { ...sealed, owner: "0x00000000000000000000000000000000000000a1", keyId: "k" });
      chain.slots.push({ id, agentId: 1n, contentHash: sealed.contentHash, topic, writtenAt: NOW - 100000n + id });
      return id++;
    };

    // 100 memories: 4 topics, each decision rewritten a few times (old versions superseded), plus a state per topic.
    for (const topic of TOPICS) {
      let prev: bigint | undefined;
      for (let v = 0; v < 5; v++) prev = await put({ content: body(v, topic), gist: `${topic} decision v${v}`, kind: "decision", supersedes: prev, entities: [topic] }, topic);
      for (let n = 0; n < 19; n++) await put({ content: body(100 + n, topic), gist: `${topic} note ${n}`, kind: "fact" }, topic);
      await put({ content: `Summary of ${topic}: ${body(0, topic).slice(0, 600)}`, gist: `${topic} state`, kind: "state" }, topic);
    }

    const deps: ReadDeps = { chain, store, encryptionKey: KEY, now: () => NOW, docs: new DocCache() };
    const before = size(await readMemory(deps, { agentId: 2n }));

    const state = await readMemory(deps, { agentId: 2n, kind: "state", topic: "bridge" });
    const fresh = await listMemory(deps, { agentId: 2n, cursor: `${NOW - 100000n + 60n}:60`, topic: "bridge", limit: 5 });
    const found = await searchMemory(deps, { agentId: 2n, query: "bridge decision v4", limit: 5 });
    const one = await readMemory(deps, { agentId: 2n, slotIds: [BigInt(found.memories[0]!.slotId)] });
    const after = size(state) + size(fresh) + size(found) + size(one);

    expect(before).toBeGreaterThan(20_000);
    expect(after).toBeLessThan(before / 4);
    if (process.env.HIVE_SIZE_LOG === "1") console.log(`bare read ${before} bytes, new loop ${after} bytes (${Math.round((after / before) * 100)}%)`);
  });
});
