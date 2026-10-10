import type { Hex } from "@hive/shared";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { bytesToHex, hexToBytes } from "viem";
import type { NewCiphertext, StoredCiphertext, VectorStore } from "./types.js";

// ADR-022: memory_embedding in Supabase (supabase/migrations). Service role only; RLS shuts out everyone else.
// Holds AES-GCM ciphertext of a vector, never a vector in the clear. bytea travels as "\x<hex>" strings, as in store.ts.

const TABLE = "memory_embedding";
const GET_CHUNK = 100;

const toBytea = (bytes: Uint8Array) => `\\x${bytesToHex(bytes).slice(2)}`;
const fromBytea = (value: string) => hexToBytes(`0x${value.replace(/^\\x/, "")}`);

export class SupabaseVectorStore implements VectorStore {
  private db: SupabaseClient;

  constructor(url: string, serviceKey: string) {
    this.db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async getVectors(contentHashes: readonly Hex[], model: string) {
    const hashes = [...new Set(contentHashes.map((h) => h.toLowerCase()))];
    const chunks: string[][] = [];
    for (let i = 0; i < hashes.length; i += GET_CHUNK) chunks.push(hashes.slice(i, i + GET_CHUNK));
    const pages = await Promise.all(
      chunks.map(async (chunk) => {
        const { data, error } = await this.db.from(TABLE).select("content_hash, ciphertext, iv").eq("model", model).in("content_hash", chunk);
        if (error) throw new Error(`supabase getVectors failed: ${error.message}`);
        return data ?? [];
      }),
    );
    const out = new Map<string, StoredCiphertext>();
    for (const row of pages.flat()) out.set(row.content_hash, { ciphertext: fromBytea(row.ciphertext), iv: fromBytea(row.iv) });
    return out;
  }

  /** The row belongs to a memory_content row, so a vector can only be stored for a memory that was written. */
  async putVector(contentHash: Hex, model: string, dims: number, { ciphertext, iv, owner, keyId }: NewCiphertext) {
    const { error } = await this.db
      .from(TABLE)
      .upsert({ content_hash: contentHash.toLowerCase(), model, dims, owner: owner.toLowerCase(), ciphertext: toBytea(ciphertext), iv: toBytea(iv), key_id: keyId }, { onConflict: "content_hash,model", ignoreDuplicates: true });
    if (error) throw new Error(`supabase putVector failed: ${error.message}`);
  }

  /** For /health-style checks: true when the table answers with the service key. */
  async reachable() {
    const { error } = await this.db.from(TABLE).select("content_hash", { head: true }).limit(1);
    return !error;
  }
}
