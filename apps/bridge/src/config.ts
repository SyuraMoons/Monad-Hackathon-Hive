import { monadTestnet } from "@hive/shared";
import { z } from "zod";

const zConfig = z.object({
  BRIDGE_PORT: z.coerce.number().int().positive().default(4000),
  BRIDGE_CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:3100"),
  BRIDGE_JWT_SECRET: z.string().min(32, "BRIDGE_JWT_SECRET must be at least 32 characters (openssl rand -hex 32)"),
  NEXT_PUBLIC_MONAD_RPC: z.url().default(monadTestnet.rpcUrls.default.http[0]),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
});

export type Config = {
  port: number;
  corsOrigins: string[];
  jwtSecret: string;
  rpcUrl: string;
  supabase: { url: string; serviceKey: string } | undefined;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const e = zConfig.parse(env);
  return {
    port: e.BRIDGE_PORT,
    corsOrigins: e.BRIDGE_CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
    jwtSecret: e.BRIDGE_JWT_SECRET,
    rpcUrl: e.NEXT_PUBLIC_MONAD_RPC,
    supabase: e.SUPABASE_URL && e.SUPABASE_SERVICE_ROLE_KEY ? { url: e.SUPABASE_URL, serviceKey: e.SUPABASE_SERVICE_ROLE_KEY } : undefined,
  };
}
