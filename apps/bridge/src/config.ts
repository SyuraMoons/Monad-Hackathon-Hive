import { monadTestnet, type Hex } from "@hive/shared";
import { z } from "zod";

const zConfig = z.object({
  BRIDGE_PORT: z.coerce.number().int().positive().default(4000),
  BRIDGE_CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:3100"),
  BRIDGE_JWT_SECRET: z.string().min(32, "BRIDGE_JWT_SECRET must be at least 32 characters (openssl rand -hex 32)"),
  NEXT_PUBLIC_MONAD_RPC: z.url().default(monadTestnet.rpcUrls.default.http[0]),
  BRIDGE_PUBLIC_URL: z.url().optional(),
  BRIDGE_WEB_URL: z.url().optional(),
  BRIDGE_FUNDER_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "BRIDGE_FUNDER_PRIVATE_KEY must be a 0x-prefixed 32-byte key").optional(),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  HIVE_EMBEDDINGS: z.enum(["on", "off"]).default("off"),
  HIVE_EMBED_MODEL: z.string().min(1).default("Xenova/multilingual-e5-small"),
  HIVE_MODEL_CACHE_DIR: z.string().optional(),
  HIVE_EMBED_MIN_SIM: z.coerce.number().min(0).max(1).default(0.8),
});

export type Config = {
  port: number;
  corsOrigins: string[];
  jwtSecret: string;
  rpcUrl: string;
  /** Public base URL used in `mcpUrl`. Unset: derived from the request. */
  publicUrl: string | undefined;
  /** Where the web app (and its OAuth consent page) lives. OAuth for claude.ai is on only when this and `publicUrl` are set. */
  webUrl: string | undefined;
  /** Testnet-only key that tops up agent keys (ADR-007). Unset: no top-up. */
  funderKey: Hex | undefined;
  supabase: { url: string; serviceKey: string } | undefined;
  /** Search by meaning (ADR-022). Off by default: the model is a large download and needs memory. */
  embeddings: { enabled: boolean; model: string; cacheDir: string | undefined; minSimilarity: number };
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const e = zConfig.parse(env);
  return {
    port: e.BRIDGE_PORT,
    corsOrigins: e.BRIDGE_CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
    jwtSecret: e.BRIDGE_JWT_SECRET,
    rpcUrl: e.NEXT_PUBLIC_MONAD_RPC,
    publicUrl: e.BRIDGE_PUBLIC_URL,
    webUrl: e.BRIDGE_WEB_URL,
    funderKey: e.BRIDGE_FUNDER_PRIVATE_KEY as Hex | undefined,
    supabase: e.SUPABASE_URL && e.SUPABASE_SERVICE_ROLE_KEY ? { url: e.SUPABASE_URL, serviceKey: e.SUPABASE_SERVICE_ROLE_KEY } : undefined,
    embeddings: { enabled: e.HIVE_EMBEDDINGS === "on", model: e.HIVE_EMBED_MODEL, cacheDir: e.HIVE_MODEL_CACHE_DIR, minSimilarity: e.HIVE_EMBED_MIN_SIM },
  };
}
