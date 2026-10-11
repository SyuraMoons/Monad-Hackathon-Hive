import type { MemoryKind } from "@hive/shared";

/** A memory as its owner reads it: decrypted on this device and held in memory only. */
export type MemoryView = { content: string; gist?: string; kind?: MemoryKind };

/** The encryption key isn't on this device yet (after a reload, until the passkey is touched). */
export class LockedError extends Error {
  constructor() {
    super("Unlock with your passkey to read your memories.");
    this.name = "LockedError";
  }
}
