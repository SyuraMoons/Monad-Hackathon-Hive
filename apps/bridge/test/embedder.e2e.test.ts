import { describe, expect, it } from "vitest";
import { dot } from "../src/embeddings.js";
import { TransformersEmbedder } from "../src/embedder.js";

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
});
