import { encrypt, encryptBytes } from "@hive/crypto";
import type { Hex } from "@hive/shared";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { SupabaseCiphertextStore } from "../src/store.js";
import { SupabaseVectorStore } from "../src/vectors.js";

// Live test against the Supabase project in the repo-root .env. Skipped unless HIVE_VECTOR_TABLE=1, which says the
// memory_embedding migration (supabase/migrations/20261011000000_memory_embedding.sql) has been applied there.
try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url));
} catch {}
const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey } = process.env;
const ready = !!url && !!serviceKey && process.env.HIVE_VECTOR_TABLE === "1";

const KEY = ("0x" + "77".repeat(32)) as Hex;
const OWNER = "0x00000000000000000000000000000000000000A1";
const written: Hex[] = [];

describe.skipIf(!ready)("SupabaseVectorStore (live)", () => {
  if (!ready) return;
  const memories = new SupabaseCiphertextStore(url!, serviceKey!);
  const vectors = new SupabaseVectorStore(url!, serviceKey!);
  const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });

  afterAll(async () => {
    // memory_embedding rows go with their memory_content row (on delete cascade).
    if (written.length) await admin.from("memory_content").delete().in("content_hash", written);
  });

  async function memory(text: string) {
    const sealed = await encrypt(`${text} ${Date.now()}`, KEY);
    written.push(sealed.contentHash);
    await memories.put(sealed.contentHash, { ...sealed, owner: OWNER, keyId: "hive/encrypt" });
    return sealed.contentHash;
  }

  it("stores a sealed vector, reads it back by model, and holds no vector in the clear", async () => {
    const hash = await memory("vector one");
    const vector = new Uint8Array(384 * 4).map((_, i) => i % 251);
    const sealed = await encryptBytes(vector, KEY);
    await vectors.putVector(hash, "test-model", 384, { ...sealed, owner: OWNER, keyId: "hive/encrypt" });

    const { data: row } = await admin.from("memory_embedding").select("*").eq("content_hash", hash).single();
    expect(row.model).toBe("test-model");
    expect(row.dims).toBe(384);
    expect(row.owner).toBe(OWNER.toLowerCase());
    expect(JSON.stringify(row)).not.toContain(Buffer.from(vector).toString("hex"));

    const got = (await vectors.getVectors([hash], "test-model")).get(hash);
    expect(got).toEqual({ ciphertext: sealed.ciphertext, iv: sealed.iv });
    expect((await vectors.getVectors([hash], "another-model")).size).toBe(0);
  });

  it("writing the same vector twice is a no-op, and many hashes read in one call", async () => {
    const hashes = await Promise.all(Array.from({ length: 105 }, (_, i) => memory(`bulk ${i}`)));
    const sealed = await encryptBytes(new Uint8Array(8), KEY);
    await vectors.putVector(hashes[0]!, "test-model", 2, { ...sealed, owner: OWNER, keyId: "k" });
    await expect(vectors.putVector(hashes[0]!, "test-model", 2, { ...sealed, owner: OWNER, keyId: "k" })).resolves.toBeUndefined();
    await Promise.all(hashes.slice(1).map((h) => vectors.putVector(h, "test-model", 2, { ...sealed, owner: OWNER, keyId: "k" })));
    expect((await vectors.getVectors(hashes, "test-model")).size).toBe(105);
  });

  it("refuses a vector for a memory that was never written", async () => {
    const sealed = await encryptBytes(new Uint8Array(8), KEY);
    await expect(vectors.putVector(("0x" + "ee".repeat(32)) as Hex, "test-model", 2, { ...sealed, owner: OWNER, keyId: "k" })).rejects.toThrow(/putVector failed/);
  });

  it("reports itself reachable", async () => {
    expect(await vectors.reachable()).toBe(true);
  });
});
