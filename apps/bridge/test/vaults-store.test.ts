import type { Hex } from "@hive/shared";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { SupabaseVaultStore } from "../src/vaults.js";

// Live test against the Supabase project in the repo-root .env. Needs the passkey_vaults migration applied.
// Skipped when the keys are unset (CI, cloud sessions).
try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url));
} catch {}
const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey } = process.env;

const ALICE = "0x00000000000000000000000000000000000000A1" as Hex;
const BOB = "0x00000000000000000000000000000000000000B2" as Hex;
const CRED = `test-vault-${Date.now()}`;
const VAULT = { version: 1, ciphertext: "c2VhbGVk" };

describe.skipIf(!url || !serviceKey)("SupabaseVaultStore (live)", () => {
  // The describe body runs even when skipped, and createClient throws on an empty URL.
  if (!url || !serviceKey) return;
  const store = new SupabaseVaultStore(url, serviceKey);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  afterAll(async () => {
    await admin.from("passkey_vaults").delete().eq("credential_id", CRED);
  });

  it("returns undefined for an unknown credential", async () => {
    expect(await store.get(CRED)).toBeUndefined();
  });

  it("creates, reads back, lets the owner replace, and refuses another owner", async () => {
    expect(await store.put(CRED, ALICE, VAULT)).toBe("created");
    expect(await store.get(CRED)).toEqual(VAULT);

    const { data: row } = await admin.from("passkey_vaults").select("owner").eq("credential_id", CRED).single();
    expect(row?.owner).toBe(ALICE.toLowerCase());

    expect(await store.put(CRED, ALICE.toLowerCase() as Hex, { ...VAULT, ciphertext: "bmV3" })).toBe("replaced");
    expect(await store.put(CRED, BOB, { evil: true })).toBe("forbidden");
    expect(await store.get(CRED)).toEqual({ ...VAULT, ciphertext: "bmV3" });
  });
});
