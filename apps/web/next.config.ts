import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } from "next/constants";

export default function config(phase: string): NextConfig {
  // The mock data layer is a dev scaffold, never the demo (rules.md golden rule 8).
  if ((phase === PHASE_PRODUCTION_BUILD || phase === PHASE_PRODUCTION_SERVER) && process.env.NEXT_PUBLIC_HIVE_MODE === "mock") {
    throw new Error("NEXT_PUBLIC_HIVE_MODE=mock is not allowed in production builds. Use `live`, or run `next dev`.");
  }
  return {
    transpilePackages: ["@hive/shared"],
    // Hide Next's floating "N" badge in dev; build errors still show as an overlay.
    devIndicators: false,
  };
}
