import { decrypt, encrypt } from "@hive/crypto";
import type { Hex } from "@hive/shared";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { SupabaseCiphertextStore } from "../src/store.js";

// Live test against the Supabase project in the repo-root .env. Skipped when the keys are unset (CI, cloud sessions).
try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url));
} catch {}
const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey } = process.env;

const KEY = ("0x" + "77".repeat(32)) as Hex;
const OWNER = "0x00000000000000000000000000000000000000A1";
const written: Hex[] = [];

describe.skipIf(!url || !serviceKey)("SupabaseCiphertextStore (live)", () => {
  const store = new SupabaseCiphertextStore(url!, serviceKey!);
  const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });

  afterAll(async () => {
    if (written.length) await admin.from("memory_content").delete().in("content_hash", written);
  });

  it("stores only ciphertext and reads it back", async () => {
    const plaintext = `hive store test ${Date.now()}`;
    const sealed = await encrypt(plaintext, KEY);
    written.push(sealed.contentHash);
    await store.put(sealed.contentHash, { ...sealed, owner: OWNER, keyId: "hive/encrypt" });

    const { data: row } = await admin.from("memory_content").select("*").eq("content_hash", sealed.contentHash).single();
    expect(row.owner).toBe(OWNER.toLowerCase());
    expect(row.key_id).toBe("hive/encrypt");
    expect(JSON.stringify(row)).not.toContain(plaintext);
    expect(JSON.stringify(row)).not.toContain(Buffer.from(plaintext).toString("hex"));

    const got = await store.get(sealed.contentHash);
    expect(got).toEqual({ ciphertext: sealed.ciphertext, iv: sealed.iv });
    expect(await decrypt(got!, KEY)).toBe(plaintext);
  });

  it("writing the same content twice is a no-op", async () => {
    const sealed = await encrypt("twice", KEY);
    written.push(sealed.contentHash);
    await store.put(sealed.contentHash, { ...sealed, owner: OWNER, keyId: "hive/encrypt" });
    await expect(store.put(sealed.contentHash, { ...sealed, owner: OWNER, keyId: "hive/encrypt" })).resolves.toBeUndefined();
  });

  it("rejects a contentHash that doesn't match the ciphertext", async () => {
    const a = await encrypt("a", KEY);
    const b = await encrypt("b", KEY);
    await expect(store.put(a.contentHash, { ...b, owner: OWNER, keyId: "hive/encrypt" })).rejects.toThrow(/does not match/);
    expect(await store.get(a.contentHash)).toBeUndefined();
  });

  it("returns undefined for an unknown hash and reports itself reachable", async () => {
    expect(await store.get(("0x" + "ab".repeat(32)) as Hex)).toBeUndefined();
    expect(await store.reachable()).toBe(true);
  });
});
