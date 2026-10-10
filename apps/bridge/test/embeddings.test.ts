import { decryptBytes, encrypt } from "@hive/crypto";
import { sealDoc, type Hex } from "@hive/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BACKFILL_SYNC, backfillPending, dot, vectorFromBytes, vectorToBytes, type EmbeddingDeps } from "../src/embeddings.js";
import { writeMemory, type ReadDeps, type WriteDeps } from "../src/memory.js";
import { topicHash } from "../src/permissions.js";
import { searchMemory } from "../src/search.js";
import { DocCache } from "../src/sessions.js";
import { InMemoryChain, InMemoryCiphertextStore, InMemoryVectorStore } from "../src/stubs.js";
import { FakeEmbedder } from "./helpers/fakeEmbedder.js";

const KEY = ("0x" + "33".repeat(32)) as Hex;
const OTHER_KEY = ("0x" + "44".repeat(32)) as Hex;
const OWNER = "0x00000000000000000000000000000000000000a1";
const NOW = 1_000_000n;
const [CLAUDE, CHATGPT, THERAPY] = [1n, 2n, 3n];
const GROUPS = [["deploy", "release", "ship", "publish"], ["app", "website", "site"], ["host", "hosting", "server"]];

let chain: InMemoryChain;
let store: InMemoryCiphertextStore;
let vectors: InMemoryVectorStore;
let embedder: FakeEmbedder;
let deps: ReadDeps;
let errors: string[];
let next = 1n;

const embeddings = (): EmbeddingDeps => ({ embedder, vectors, owner: OWNER, keyId: "k", minSimilarity: 0.5 });

async function put(agentId: bigint, topic: string, doc: Parameters<typeof sealDoc>[0], writtenAt = NOW - 100000n + next) {
  const sealed = await encrypt(sealDoc(doc), KEY);
  await store.put(sealed.contentHash, { ...sealed, owner: OWNER, keyId: "k" });
  const id = next++;
  chain.slots.push({ id, agentId, contentHash: sealed.contentHash, topic, writtenAt });
  return { id, hash: sealed.contentHash };
}
const search = (query: string, extra: Record<string, unknown> = {}, as = CHATGPT) => searchMemory(deps, { agentId: as, query, ...extra });

beforeEach(() => {
  chain = new InMemoryChain();
  store = new InMemoryCiphertextStore();
  vectors = new InMemoryVectorStore();
  embedder = new FakeEmbedder("fake-e5", GROUPS);
  errors = [];
  next = 1n;
  for (const [id, name] of [[CLAUDE, "Claude"], [CHATGPT, "ChatGPT"], [THERAPY, "Therapy Bot"]] as const) chain.agents.set(id, { id, name, owner: "0x0000000000000000000000000000000000000001", agentType: "other", writer: "0x0000000000000000000000000000000000000000" });
  chain.edges.push({ id: 1n, from: CLAUDE, to: CHATGPT, topicHash: topicHash("*"), expiresAt: NOW + 1000n, active: true });
  deps = { chain, store, encryptionKey: KEY, now: () => NOW, docs: new DocCache(), embeddings: embeddings(), onError: (s) => errors.push(s) };
});

describe("vector codec", () => {
  it("round-trips a vector through bytes, little-endian", () => {
    const v = Float32Array.from([0.5, -0.25, 1, 0]);
    expect(vectorFromBytes(vectorToBytes(v), 4)).toEqual(v);
    expect(vectorToBytes(v).length).toBe(16);
    expect(() => vectorFromBytes(new Uint8Array(15), 4)).toThrow();
  });
  it("dot of two unit vectors is their cosine", async () => {
    const [a, b, c] = await embedder.embedPassages(["deploy app", "release website", "kubernetes cluster"]);
    expect(dot(a!, a!)).toBeCloseTo(1);
    expect(dot(a!, b!)).toBeCloseTo(1);
    expect(dot(a!, c!)).toBeLessThan(0.1);
  });
});

describe("hybrid search", () => {
  it("finds by meaning what the words alone miss, and says so", async () => {
    await put(CLAUDE, "work", { content: "Deploy the app on Railway." });
    await put(CLAUDE, "work", { content: "Standup is at 10:30." });
    embedder.state = "loading";
    expect((await search("publish our website")).memories).toEqual([]);
    embedder.state = "ready";
    const out = await search("publish our website");
    expect(out.mode).toBe("hybrid");
    expect(out.memories).toHaveLength(1);
    expect(out.memories[0]).toMatchObject({ preview: "Deploy the app on Railway.", matched: ["meaning"] });
  });

  it("keeps a word match first and marks it as both", async () => {
    await put(CLAUDE, "work", { content: "Railway host bridge." });
    await put(CLAUDE, "work", { content: "Ship the site on Fridays." });
    const out = await search("railway hosting");
    expect(out.memories[0]).toMatchObject({ preview: "Railway host bridge." });
    expect(out.memories[0]!.matched).toEqual(expect.arrayContaining(["text", "meaning"]));
  });

  it("ignores a vector match under the similarity floor", async () => {
    await put(CLAUDE, "work", { content: "Quarterly kubernetes budget review." });
    expect((await search("publish our website")).memories).toEqual([]);
  });

  it("falls back to words when the model is not ready, with no model calls", async () => {
    embedder.state = "loading";
    await put(CLAUDE, "work", { content: "Railway hosts the bridge." });
    const out = await search("railway");
    expect(out.mode).toBe("lexical");
    expect(out.pending).toBeUndefined();
    expect(out.memories).toHaveLength(1);
    expect(embedder.queryCalls).toEqual([]);
    expect(embedder.passagesEmbedded).toBe(0);
  });

  it("falls back to words when the query embedding fails, reporting the stage only", async () => {
    await put(CLAUDE, "work", { content: "Railway hosts the bridge." });
    embedder.failQuery = true;
    const out = await search("railway");
    expect(out.mode).toBe("lexical");
    expect(out.memories).toHaveLength(1);
    expect(errors).toEqual(["embed"]);
  });

  it("keeps ranking on words for a memory whose embedding fails", async () => {
    await put(CLAUDE, "work", { content: "Railway hosts the bridge." });
    embedder.failPassages = true;
    const out = await search("railway");
    expect(out.memories).toHaveLength(1);
    expect(out.mode).toBe("lexical");
    expect(out.pending).toBe(1);
    expect(errors).toContain("embed");
  });
});

describe("vectors are stored encrypted and reused", () => {
  it("stores ciphertext that only the owner's key opens", async () => {
    const { hash } = await put(CLAUDE, "work", { content: "We deploy the app on Railway." });
    await search("publish website");
    const row = (await vectors.getVectors([hash], "fake-e5")).get(hash.toLowerCase())!;
    expect(row.ciphertext.length).toBe(64 * 4 + 16);
    const raw = await decryptBytes(row, KEY);
    expect(raw.length).toBe(64 * 4);
    expect(Buffer.from(row.ciphertext).equals(Buffer.from(raw))).toBe(false);
    await expect(decryptBytes(row, OTHER_KEY)).rejects.toThrow();
    expect(vectorFromBytes(raw, 64)).toEqual((await embedder.embedPassages(["We deploy the app on Railway."]))[0]);
  });

  it("does not embed a memory twice in a session", async () => {
    await put(CLAUDE, "work", { content: "We deploy the app on Railway." });
    await search("publish website");
    await search("publish website");
    expect(embedder.passagesEmbedded).toBe(1);
  });

  it("a new session reads the stored vector instead of running the model", async () => {
    await put(CLAUDE, "work", { content: "We deploy the app on Railway." });
    await search("publish website");
    deps = { ...deps, docs: new DocCache() };
    const out = await search("publish website");
    expect(out.memories).toHaveLength(1);
    expect(embedder.passagesEmbedded).toBe(1);
  });

  it("never mixes vectors of another model", async () => {
    await put(CLAUDE, "work", { content: "We deploy the app on Railway." });
    await search("publish website");
    embedder = new FakeEmbedder("fake-e5-v2", GROUPS);
    deps = { ...deps, docs: new DocCache(), embeddings: embeddings() };
    await search("publish website");
    expect(embedder.passagesEmbedded).toBe(1);
  });

  it("ignores a stored vector of the wrong size and embeds again", async () => {
    const { hash } = await put(CLAUDE, "work", { content: "We deploy the app on Railway." });
    const { ciphertext, iv } = await (await import("@hive/crypto")).encryptBytes(new Uint8Array(12), KEY);
    await vectors.putVector(hash, "fake-e5", 64, { ciphertext, iv, owner: OWNER, keyId: "k" });
    const out = await search("publish website");
    expect(out.memories).toHaveLength(1);
    expect(errors).toContain("embed");
  });
});

describe("backfill", () => {
  it("embeds at most 20 inside the call, finishes the rest in the background, and reports what is pending", async () => {
    for (let i = 0; i < 30; i++) await put(CLAUDE, "work", { content: `Note ${i} about hosting the website.` });
    const first = await search("publish site", { limit: 20 });
    expect(embedder.passageCalls[0]).toHaveLength(BACKFILL_SYNC);
    expect(first.pending).toBe(10);
    expect(first.mode).toBe("hybrid");
    await vi.waitFor(() => expect(embedder.passagesEmbedded).toBe(30));
    await vi.waitFor(() => expect(backfillPending(deps.docs)).toBe(0));
    const second = await search("publish site", { limit: 20 });
    expect(second.pending).toBeUndefined();
    expect(embedder.passagesEmbedded).toBe(30);
  });

  it("embeds the newest memories first", async () => {
    for (let i = 0; i < 25; i++) await put(CLAUDE, "work", { content: `Note number${i} about hosting.` });
    await search("hosting");
    const first = embedder.passageCalls[0]!;
    expect(first[0]).toContain("number24");
    expect(first.join(" ")).not.toContain("number0 ");
  });

  it("stops the background work when the model fails, without looping", async () => {
    for (let i = 0; i < 30; i++) await put(CLAUDE, "work", { content: `Note ${i} about hosting.` });
    embedder.failPassages = true;
    await search("hosting");
    await vi.waitFor(() => expect(backfillPending(deps.docs)).toBe(0));
    expect(embedder.passageCalls.length).toBeLessThan(5);
  });
});

describe("permissions come first", () => {
  it("never embeds or ranks a memory the reader may not read", async () => {
    await put(CLAUDE, "work", { content: "The launch code is 4471, deploy it." });
    const out = await search("deploy launch code", {}, THERAPY);
    expect(out.memories).toEqual([]);
    expect(embedder.passagesEmbedded).toBe(0);
  });

  it("a revoke empties the next search with the vector cache warm", async () => {
    await put(CLAUDE, "work", { content: "We deploy the app on Railway." });
    expect((await search("publish website")).memories).toHaveLength(1);
    chain.edges[0]!.active = false;
    expect((await search("publish website")).memories).toEqual([]);
  });

  it("no error, stage name or log carries a memory or the query", async () => {
    await put(CLAUDE, "work", { content: "Secret roadmap deploy plan." });
    embedder.failQuery = true;
    embedder.failPassages = true;
    await search("secret roadmap");
    expect(JSON.stringify(errors)).not.toMatch(/secret|roadmap|deploy/i);
  });
});

describe("embedding on write", () => {
  let wdeps: WriteDeps;
  beforeEach(() => {
    wdeps = {
      chain,
      store,
      encryptionKey: KEY,
      owner: OWNER,
      agentKey: KEY,
      docs: deps.docs,
      embeddings: embeddings(),
      onError: (s) => errors.push(s),
      writer: { write: async ({ agentId, contentHash, topic }) => { const id = next++; chain.slots.push({ id, agentId, contentHash, topic, writtenAt: NOW }); return { txHash: ("0x" + "ee".repeat(32)) as Hex, slotId: id, propagatedTo: [] }; } },
    };
  });

  it("embeds and stores the new memory without making the write wait, then search needs no model run", async () => {
    const out = await writeMemory(wdeps, { agentId: CLAUDE, topic: "work", content: "We deploy the app on Railway.", gist: "Hosting" });
    await vi.waitFor(async () => expect((await vectors.getVectors([out.contentHash], "fake-e5")).size).toBe(1));
    expect(embedder.passageCalls[0]![0]).toBe("Hosting\nWe deploy the app on Railway.");
    const before = embedder.passagesEmbedded;
    expect((await search("publish website")).memories).toHaveLength(1);
    expect(embedder.passagesEmbedded).toBe(before);
  });

  it("a failing embedder does not fail the write", async () => {
    embedder.failPassages = true;
    const out = await writeMemory(wdeps, { agentId: CLAUDE, topic: "work", content: "x" });
    expect(out.slotId).toBeGreaterThan(0n);
    await vi.waitFor(() => expect(errors).toContain("embed"));
  });

  it("does nothing when the model is not ready", async () => {
    embedder.state = "loading";
    await writeMemory(wdeps, { agentId: CLAUDE, topic: "work", content: "x" });
    expect(embedder.passageCalls).toEqual([]);
  });
});
