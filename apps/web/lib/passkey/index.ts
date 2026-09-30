import { HIVE_MODE } from "@/lib/hive/mode";
import type { PasskeyService } from "./types";

let service: Promise<PasskeyService> | null = null;

/** Real Mera in live mode; the mock only in development, behind a dynamic import (golden rule 8). */
export function getPasskeyService(): Promise<PasskeyService> {
  if (!service) {
    service =
      process.env.NODE_ENV !== "production" && HIVE_MODE === "mock"
        ? import("./mock").then((m) => m.createMockPasskeyService())
        : import("./mera").then((m) => m.createMeraPasskeyService());
  }
  return service;
}

export * from "./types";
