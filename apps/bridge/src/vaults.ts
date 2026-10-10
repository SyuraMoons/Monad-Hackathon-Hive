import type { Hex } from "@hive/shared";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PutVaultResult, VaultStore } from "./types.js";

// passkey_vaults in Supabase (supabase/migrations). Service role only; RLS shuts out everyone else.
// The vault is a Mera secret vault: ciphertext only, the recovery phrase never reaches the bridge.

const TABLE = "passkey_vaults";

export class SupabaseVaultStore implements VaultStore {
  private db: SupabaseClient;

  constructor(url: string, serviceKey: string) {
    this.db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async get(credentialId: string) {
    const { data, error } = await this.db.from(TABLE).select("vault").eq("credential_id", credentialId).maybeSingle();
    if (error) throw new Error(`supabase get failed: ${error.message}`);
    return data?.vault as Record<string, unknown> | undefined;
  }

  /** The first owner to write a credential keeps it. Anyone else gets "forbidden". */
  async put(credentialId: string, owner: Hex, vault: Record<string, unknown>): Promise<PutVaultResult> {
    const me = owner.toLowerCase();
    const { data: inserted, error } = await this.db
      .from(TABLE)
      .upsert({ credential_id: credentialId, owner: me, vault }, { onConflict: "credential_id", ignoreDuplicates: true })
      .select("credential_id");
    if (error) throw new Error(`supabase put failed: ${error.message}`);
    if (inserted?.length) return "created";

    const { data: existing, error: readError } = await this.db.from(TABLE).select("owner").eq("credential_id", credentialId).single();
    if (readError) throw new Error(`supabase put failed: ${readError.message}`);
    if (existing.owner !== me) return "forbidden";
    const { error: updateError } = await this.db.from(TABLE).update({ vault }).eq("credential_id", credentialId).eq("owner", me);
    if (updateError) throw new Error(`supabase put failed: ${updateError.message}`);
    return "replaced";
  }
}
