import type { PasskeyService } from "./types";

let service: Promise<PasskeyService> | null = null;

/** Real Mera in every mode, mock included: only the backend is mocked, never the passkey. */
export function getPasskeyService(): Promise<PasskeyService> {
  if (!service) service = import("./mera").then((m) => m.createMeraPasskeyService());
  return service;
}

export * from "./types";
