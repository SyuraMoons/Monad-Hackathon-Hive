import type { HiveMode } from "./types";

// NEXT_PUBLIC_HIVE_MODE is inlined at build time. Default: `mock` in `next dev`, `live` in production.
const raw = process.env.NEXT_PUBLIC_HIVE_MODE;

export const HIVE_MODE: HiveMode =
  raw === "mock" || raw === "live" ? raw : process.env.NODE_ENV === "production" ? "live" : "mock";

// The mock is a development scaffold, never the demo (rules.md golden rule 8).
if (process.env.NODE_ENV === "production" && HIVE_MODE === "mock") {
  throw new Error("Hive refuses to run a production build in mock mode. Set NEXT_PUBLIC_HIVE_MODE=live.");
}
