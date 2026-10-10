import { encrypt } from "@hive/crypto";
import { MEMORY_NOTICE, sealDoc, type Hex } from "@hive/shared";
import { beforeEach, describe, expect, it } from "vitest";
import type { ReadDeps } from "../src/memory.js";
import { topicHash } from "../src/permissions.js";
import { lexicalScores, searchMemory, tokenize } from "../src/search.js";
import { DocCache } from "../src/sessions.js";
import { InMemoryChain, InMemoryCiphertextStore } from "../src/stubs.js";

const KEY = ("0x" + "33".repeat(32)) as Hex;
const OWNER = "0x00000000000000000000000000000000000000a1";
const NOW = 1_000_000n;
const [CLAUDE, CHATGPT, THERAPY] = [1n, 2n, 3n];

describe("tokenize", () => {
  it("lower-cases, splits on punctuation and drops stop words in English and Indonesian", () => {
    expect(tokenize("The Deploy-URL of Hive, yang dan di Railway")).toEqual(["deploy", "url", "hive", "railway"]);
  });
  it("keeps ids, addresses and digits, and any script", () => {
    expect(tokenize("0xAbC123 v2 13 Okt 日本語")).toEqual(["0xabc123", "v2", "13", "okt", "日本語"]);
  });
  it("drops one-letter words but not a lone digit", () => {
    expect(tokenize("x 7 ok")).toEqual(["7", "ok"]);
  });
});

describe("lexicalScores", () => {
  const docs = [
    { content: "We deploy the web app to Vercel every Friday." },
    { content: "The bridge runs on Railway behind a TLS proxy.", gist: "Bridge hosting: Railway" },
    { content: "Standup moved to 10:30.", entities: ["standup"] },
    { content: "Contract MemorySlots lives at 0x2F5a9d", entities: ["0x2F5a9d", "MemorySlots"] },
  ];
  const rank = (q: string) => lexicalScores(q, docs).map((s, i) => [i, s] as const).filter(([, s]) => s.score > 0).sort((a, b) => b[1].score - a[1].score).map(([i]) => i);

  it("ranks the memory that holds the words first", () => {
    expect(rank("where does the bridge run")[0]).toBe(1);
    expect(rank("deploy web vercel")[0]).toBe(0);
  });
  it("returns nothing for words no memory holds", () => {
    expect(rank("quantum entanglement")).toEqual([]);
  });
  it("matches a word by its prefix at half weight: deployment finds deploy", () => {
    const [exact] = lexicalScores("deploy", docs);
    const [related] = lexicalScores("deployment", docs);
    expect(related!.score).toBeGreaterThan(0);
    expect(related!.score).toBeLessThan(exact!.score);
  });
  it("lets the gist count: a word in the gist outranks the same word once in the text", () => {
    const s = lexicalScores("railway", [{ content: "Hosting notes. Railway." }, { content: "Hosting notes.", gist: "Railway" }]);
    expect(s[1]!.score).toBeGreaterThan(s[0]!.score);
  });
  it("boosts an exact entity and flags it", () => {
    const s = lexicalScores("what is at 0x2f5a9d", docs);
    expect(s[3]).toMatchObject({ entity: true, text: true });
    expect(s[3]!.score).toBeGreaterThan(3);
    expect(s[0]!.score).toBe(0);
  });
  it("matches a multi-word entity only as a whole", () => {
    const d = [{ content: "notes", entities: ["Therapy Bot"] }];
    expect(lexicalScores("ask the therapy bot", d)[0]!.entity).toBe(true);
    expect(lexicalScores("therapy session", d)[0]!.entity).toBe(false);
  });
  it("finds an Indonesian memory with an Indonesian query", () => {
    const id = [{ content: "Rapat tim dipindah ke hari Jumat pukul 10.30." }, { content: "Deploy ke Railway selesai." }];
    const s = lexicalScores("kapan rapat tim", id);
    expect(s[0]!.score).toBeGreaterThan(0);
    expect(s[1]!.score).toBe(0);
  });
  it("handles an empty corpus and an all-stop-word query", () => {
    expect(lexicalScores("anything", [])).toEqual([]);
    expect(lexicalScores("the of and", docs).every((s) => s.score === 0)).toBe(true);
  });
});

let chain: InMemoryChain;
let store: InMemoryCiphertextStore;
let deps: ReadDeps;
let errors: string[];
let next = 1n;

async function put(agentId: bigint, topic: string, doc: Parameters<typeof sealDoc>[0], writtenAt = NOW - 1000n + next) {
  const sealed = await encrypt(sealDoc(doc), KEY);
  await store.put(sealed.contentHash, { ...sealed, owner: OWNER, keyId: "k" });
  const id = next++;
  chain.slots.push({ id, agentId, contentHash: sealed.contentHash, topic, writtenAt });
  return id;
}

beforeEach(() => {
  chain = new InMemoryChain();
  store = new InMemoryCiphertextStore();
  errors = [];
  next = 1n;
  for (const [id, name] of [[CLAUDE, "Claude"], [CHATGPT, "ChatGPT"], [THERAPY, "Therapy Bot"]] as const) chain.agents.set(id, { id, name, owner: "0x0000000000000000000000000000000000000001", agentType: "other", writer: "0x0000000000000000000000000000000000000000" });
  chain.edges.push({ id: 1n, from: CLAUDE, to: CHATGPT, topicHash: topicHash("*"), expiresAt: NOW + 1000n, active: true });
  deps = { chain, store, encryptionKey: KEY, now: () => NOW, docs: new DocCache(), onError: (s) => errors.push(s) };
});

describe("searchMemory", () => {
  it("returns ranked previews with score and what matched, plus the notice", async () => {
    await put(CLAUDE, "work", { content: "The bridge runs on Railway.", gist: "Bridge: Railway", kind: "fact", entities: ["railway"] });
    await put(CLAUDE, "work", { content: "Standup is at 10:30." });
    const out = await searchMemory(deps, { agentId: CHATGPT, query: "where is the bridge hosted on railway" });
    expect(out.mode).toBe("lexical");
    expect(out.notice).toBe(MEMORY_NOTICE);
    expect(out.memories).toHaveLength(1);
    expect(out.memories[0]).toMatchObject({ slotId: 1n, fromName: "Claude", gist: "Bridge: Railway", kind: "fact", preview: "The bridge runs on Railway.", matched: ["text", "entity"] });
    expect(out.memories[0]!.score).toBeGreaterThan(0);
    expect(out.memories[0]).not.toHaveProperty("content");
  });

  it("returns nothing, and no notice, when nothing matches", async () => {
    await put(CLAUDE, "work", { content: "Standup is at 10:30." });
    expect(await searchMemory(deps, { agentId: CHATGPT, query: "kubernetes" })).toEqual({ memories: [], mode: "lexical" });
  });

  it("an agent with no edge finds nothing, however exact the query", async () => {
    await put(CLAUDE, "work", { content: "The launch code is 4471.", entities: ["launch code"] });
    for (let i = 0; i < 3; i++) expect((await searchMemory(deps, { agentId: THERAPY, query: "launch code 4471" })).memories).toEqual([]);
  });

  it("a revoke empties the next search with the cache warm, and an expired edge too", async () => {
    await put(CLAUDE, "work", { content: "The launch code is 4471." });
    expect((await searchMemory(deps, { agentId: CHATGPT, query: "launch code" })).memories).toHaveLength(1);
    chain.edges[0]!.active = false;
    expect((await searchMemory(deps, { agentId: CHATGPT, query: "launch code" })).memories).toEqual([]);
    chain.edges[0]!.active = true;
    chain.edges[0]!.expiresAt = NOW;
    expect((await searchMemory(deps, { agentId: CHATGPT, query: "launch code" })).memories).toEqual([]);
  });

  it("filters before it ranks: a better match in another topic or an unreadable slot never shows", async () => {
    await put(CLAUDE, "personal", { content: "railway railway railway", entities: ["railway"] });
    await put(CLAUDE, "work", { content: "Hosting on Railway." });
    const out = await searchMemory(deps, { agentId: CHATGPT, query: "railway", topic: "work" });
    expect(out.memories.map((m) => m.topic)).toEqual(["work"]);
  });

  it("leaves a replaced memory out, and brings it back on request", async () => {
    const v1 = await put(CLAUDE, "work", { content: "Deploy to Vercel." });
    await put(CLAUDE, "work", { content: "Deploy to Railway.", supersedes: v1 });
    expect((await searchMemory(deps, { agentId: CHATGPT, query: "deploy" })).memories.map((m) => m.preview)).toEqual(["Deploy to Railway."]);
    expect((await searchMemory(deps, { agentId: CHATGPT, query: "deploy", includeSuperseded: true })).memories).toHaveLength(2);
  });

  it("filters by kind and searches only one's own memories with mine", async () => {
    await put(CLAUDE, "work", { content: "API: POST /write", kind: "interface" });
    await put(CLAUDE, "work", { content: "API discussion notes", kind: "session" });
    await put(CHATGPT, "work", { content: "my own API notes" });
    expect((await searchMemory(deps, { agentId: CHATGPT, query: "api", kind: "interface" })).memories.map((m) => m.kind)).toEqual(["interface"]);
    const mine = await searchMemory(deps, { agentId: CHATGPT, query: "api", mine: true });
    expect(mine.memories.map((m) => m.fromName)).toEqual(["ChatGPT"]);
  });

  it("caps the number of results and prefers the newer of two equal matches", async () => {
    for (let i = 0; i < 8; i++) await put(CLAUDE, "work", { content: "standup notes" }, NOW - 1000n + BigInt(i));
    const out = await searchMemory(deps, { agentId: CHATGPT, query: "standup", limit: 3 });
    expect(out.memories.map((m) => m.slotId)).toEqual([8n, 7n, 6n]);
    expect((await searchMemory(deps, { agentId: CHATGPT, query: "standup" })).memories).toHaveLength(5);
  });

  it("only looks at the newest 500 permitted memories", async () => {
    await put(CLAUDE, "work", { content: "zebra needle" }, NOW - 5000n);
    for (let i = 0; i < 500; i++) await put(CLAUDE, "work", { content: `filler ${i}` }, NOW - 4000n + BigInt(i));
    expect((await searchMemory(deps, { agentId: CHATGPT, query: "zebra" })).memories).toEqual([]);
  });

  it("reports a chain failure as a stage name only, with no query or content in it", async () => {
    await put(CLAUDE, "work", { content: "secret roadmap" });
    chain.edgesTo = async () => {
      throw new Error("rpc down: secret roadmap");
    };
    const out = await searchMemory(deps, { agentId: CHATGPT, query: "secret roadmap" });
    expect(out.memories).toEqual([]);
    expect(errors).toEqual(["permission-check"]);
  });
});
