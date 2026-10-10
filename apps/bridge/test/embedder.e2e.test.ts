import { encrypt } from "@hive/crypto";
import { sealDoc, type Hex } from "@hive/shared";
import { describe, expect, it } from "vitest";
import { dot } from "../src/embeddings.js";
import { TransformersEmbedder } from "../src/embedder.js";
import { topicHash } from "../src/permissions.js";
import { searchMemory } from "../src/search.js";
import { DocCache } from "../src/sessions.js";
import { InMemoryChain, InMemoryCiphertextStore, InMemoryVectorStore } from "../src/stubs.js";

// Opt-in: downloads the real model (about 120 MB) on first run. HIVE_EMBED_E2E=1 pnpm --filter @hive/bridge exec vitest run test/embedder.e2e.test.ts
// HIVE_MODEL_CACHE_DIR keeps the download out of node_modules. HIVE_EMBED_E2E_LOG=1 prints the similarity table.
const on = process.env.HIVE_EMBED_E2E === "1";

describe.skipIf(!on)("multilingual-e5-small (real model)", () => {
  const embedder = new TransformersEmbedder(process.env.HIVE_EMBED_MODEL ?? "Xenova/multilingual-e5-small", process.env.HIVE_MODEL_CACHE_DIR);

  it("loads, and makes unit vectors of 384 dimensions", async () => {
    expect(embedder.status()).toBe("loading");
    await embedder.load();
    expect(embedder.status()).toBe("ready");
    const [v] = await embedder.embedPassages(["Deploy the web app to Railway."]);
    expect(v).toHaveLength(384);
    expect(dot(v!, v!)).toBeCloseTo(1, 2);
  }, 600_000);

  const memories = {
    host: "Bridge hosting: the bridge runs on Railway behind a TLS proxy.",
    standup: "Standup moved to 10:30 on weekdays.",
    rapat: "Rapat tim dipindah ke hari Jumat pukul 10.30.",
    db: "Decision: we use Postgres on Supabase for the audit log.",
    token: "Agent token expires Sun 11 Oct 19:45 WIB, refresh HIVE_AUTH and restart Claude Desktop.",
  };
  const queries: [string, keyof typeof memories, string[]][] = [
    ["where do we host the server", "host", ["standup", "rapat"]],
    ["when is the daily meeting", "standup", ["db", "host"]],
    ["kapan rapat tim", "rapat", ["db", "token"]],
    ["which database did we pick", "db", ["standup", "rapat"]],
    ["when do I need to log in again to claude desktop", "token", ["db", "standup"]],
  ];

  it("ranks the right memory first, in English and Indonesian, and the table shows where a floor can sit", async () => {
    const keys = Object.keys(memories) as (keyof typeof memories)[];
    const docs = await embedder.embedPassages(keys.map((k) => memories[k]));
    const rows: string[] = [];
    let lowestRight = 1;
    let highestWrong = 0;
    for (const [q, right, wrong] of queries) {
      const qv = await embedder.embedQuery(q);
      const sims = Object.fromEntries(keys.map((k, i) => [k, dot(qv, docs[i]!)]));
      rows.push(`${q.padEnd(52)} ${keys.map((k) => `${k}=${sims[k]!.toFixed(3)}`).join(" ")}`);
      expect(keys.sort((a, b) => sims[b]! - sims[a]!)[0]).toBe(right);
      lowestRight = Math.min(lowestRight, sims[right]!);
      for (const w of wrong) highestWrong = Math.max(highestWrong, sims[w]!);
    }
    if (process.env.HIVE_EMBED_E2E_LOG === "1") console.log(`\n${rows.join("\n")}\nlowest right ${lowestRight.toFixed(3)}, highest wrong ${highestWrong.toFixed(3)}\n`);
    expect(lowestRight).toBeGreaterThan(highestWrong);
  }, 600_000);

  it("finds a memory through the whole search path, across languages, with no shared words", async () => {
    const KEY = ("0x" + "33".repeat(32)) as Hex;
    const chain = new InMemoryChain();
    const store = new InMemoryCiphertextStore();
    for (const [id, name] of [[1n, "Claude"], [2n, "ChatGPT"]] as const) chain.agents.set(id, { id, name, owner: "0x0000000000000000000000000000000000000001", agentType: "other", writer: "0x0000000000000000000000000000000000000000" });
    chain.edges.push({ id: 1n, from: 1n, to: 2n, topicHash: topicHash("*"), expiresAt: 2_000_000n, active: true });
    let id = 1n;
    for (const doc of [
      { content: "Rapat tim dipindah ke hari Jumat pukul 10.30.", gist: "Jadwal rapat tim" },
      { content: "We use Postgres on Supabase for the audit log.", gist: "Database choice" },
      { content: "The bridge runs on Railway behind a TLS proxy.", gist: "Bridge hosting" },
    ]) {
      const sealed = await encrypt(sealDoc(doc), KEY);
      await store.put(sealed.contentHash, { ...sealed, owner: "0x00000000000000000000000000000000000000a1", keyId: "k" });
      chain.slots.push({ id: id++, agentId: 1n, contentHash: sealed.contentHash, topic: "work", writtenAt: 1_000_000n - 100n + id });
    }
    const deps = { chain, store, encryptionKey: KEY, now: () => 1_000_000n, docs: new DocCache(), embeddings: { embedder, vectors: new InMemoryVectorStore(), owner: "0x00000000000000000000000000000000000000a1" as Hex, keyId: "k", minSimilarity: 0.78 } };
    const meeting = await searchMemory(deps, { agentId: 2n, query: "when is the team meeting" });
    expect(meeting.mode).toBe("hybrid");
    expect(meeting.memories[0]).toMatchObject({ gist: "Jadwal rapat tim", matched: ["meaning"] });
    const db = await searchMemory(deps, { agentId: 2n, query: "which database do we use" });
    expect(db.memories[0]).toMatchObject({ gist: "Database choice" });
    if (process.env.HIVE_EMBED_E2E_LOG === "1") console.log(JSON.stringify({ meeting: meeting.memories.map((m) => [m.gist, m.score, m.matched]), db: db.memories.map((m) => [m.gist, m.score, m.matched]) }));
  }, 600_000);
});
