import { monadTestnet, type Hex } from "@hive/shared";
import { z } from "zod";

const zConfig = z.object({
  BRIDGE_PORT: z.coerce.number().int().positive().default(4000),
  BRIDGE_CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:3100"),
  BRIDGE_JWT_SECRET: z.string().min(32, "BRIDGE_JWT_SECRET must be at least 32 characters (openssl rand -hex 32)"),
  NEXT_PUBLIC_MONAD_RPC: z.url().default(monadTestnet.rpcUrls.default.http[0]),
  BRIDGE_PUBLIC_URL: z.url().optional(),
  BRIDGE_FUNDER_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "BRIDGE_FUNDER_PRIVATE_KEY must be a 0x-prefixed 32-byte key").optional(),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
});

export type Config = {
  port: number;
  corsOrigins: string[];
  jwtSecret: string;
  rpcUrl: string;
  /** Public base URL used in `mcpUrl`. Unset: derived from the request. */
  publicUrl: string | undefined;
  /** Testnet-only key that tops up agent keys (ADR-007). Unset: no top-up. */
  funderKey: Hex | undefined;
  supabase: { url: string; serviceKey: string } | undefined;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const e = zConfig.parse(env);
  return {
    port: e.BRIDGE_PORT,
    corsOrigins: e.BRIDGE_CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
    jwtSecret: e.BRIDGE_JWT_SECRET,
    rpcUrl: e.NEXT_PUBLIC_MONAD_RPC,
    publicUrl: e.BRIDGE_PUBLIC_URL,
    funderKey: e.BRIDGE_FUNDER_PRIVATE_KEY as Hex | undefined,
    supabase: e.SUPABASE_URL && e.SUPABASE_SERVICE_ROLE_KEY ? { url: e.SUPABASE_URL, serviceKey: e.SUPABASE_SERVICE_ROLE_KEY } : undefined,
  };
}
