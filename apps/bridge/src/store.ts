import { contentHash as hashOf } from "@hive/crypto";
import type { Hex } from "@hive/shared";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { bytesToHex, hexToBytes } from "viem";
import type { CiphertextStore, NewCiphertext } from "./types.js";

// HF-3: memory_content in Supabase (supabase/migrations). Service role only; RLS shuts out everyone else.
// PostgREST sends bytea as "\x<hex>" strings both ways.

const TABLE = "memory_content";

const toBytea = (bytes: Uint8Array) => `\\x${bytesToHex(bytes).slice(2)}`;
const fromBytea = (value: string) => hexToBytes(`0x${value.replace(/^\\x/, "")}`);

export class SupabaseCiphertextStore implements CiphertextStore {
  private db: SupabaseClient;

  constructor(url: string, serviceKey: string) {
    this.db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async get(contentHash: Hex) {
    const { data, error } = await this.db.from(TABLE).select("ciphertext, iv").eq("content_hash", contentHash.toLowerCase()).maybeSingle();
    if (error) throw new Error(`supabase get failed: ${error.message}`);
    return data ? { ciphertext: fromBytea(data.ciphertext), iv: fromBytea(data.iv) } : undefined;
  }

  /** Rejects a hash that isn't keccak256(iv ‖ ciphertext). Writing the same content twice is a no-op. */
  async put(contentHash: Hex, { ciphertext, iv, owner, keyId }: NewCiphertext) {
    const hash = contentHash.toLowerCase();
    if (hashOf(iv, ciphertext) !== hash) throw new Error("contentHash does not match iv and ciphertext");
    const { error } = await this.db
      .from(TABLE)
      .upsert({ content_hash: hash, owner: owner.toLowerCase(), ciphertext: toBytea(ciphertext), iv: toBytea(iv), key_id: keyId }, { onConflict: "content_hash", ignoreDuplicates: true });
    if (error) throw new Error(`supabase put failed: ${error.message}`);
  }

  /** For /health: true when the table answers with the service key. */
  async reachable() {
    const { error } = await this.db.from(TABLE).select("content_hash", { head: true }).limit(1);
    return !error;
  }
}
