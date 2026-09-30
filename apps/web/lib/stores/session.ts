"use client";

import { authMessage, HiveError, type Address } from "@hive/shared";
import { create } from "zustand";
import { getHiveClient, HIVE_MODE } from "@/lib/hive/client";
import type { HiveMode } from "@/lib/hive/types";
import { getPasskeyService, PasskeyError, type HiveKeys, type PasskeyErrorCode } from "@/lib/passkey";

/** Login screen states (Figma 05 · Login): 1 signed-out · 2 waiting · 3 verified · 4 error. */
type Status = "signed-out" | "waiting" | "verified" | "signed-in" | "error";

export type LoginError = { code: PasskeyErrorCode | "BRIDGE"; message: string };

type SessionState = {
  status: Status;
  mode: HiveMode;
  owner?: Address;
  userToken?: string;
  expiresAt?: number;
  /** Derived from the passkey on this device. Memory only: never persisted, gone on reload. */
  keys?: HiveKeys;
  /** Which key rows on Login 3 are done. */
  progress: { owner: boolean; encryption: boolean; scope: boolean };
  /** Where to go after Login 3: /connect when no agent is connected yet (rules §6). */
  destination?: "/connect" | "/canvas";
  error?: LoginError;
  signIn(options?: { create?: boolean }): Promise<void>;
  cancel(): void;
  reset(): void;
  signOut(): Promise<void>;
};

let inFlight: AbortController | null = null;

const initial = { status: "signed-out" as Status, progress: { owner: false, encryption: false, scope: false } };

export const useSession = create<SessionState>()((set, get) => ({
  ...initial,
  mode: HIVE_MODE,

  async signIn({ create = false } = {}) {
    inFlight?.abort();
    const ac = new AbortController();
    inFlight = ac;
    get().keys?.end();
    set({ ...initial, status: "waiting", keys: undefined, error: undefined, destination: undefined });

    let keys: HiveKeys | undefined;
    try {
      const passkey = await getPasskeyService();
      const secret = await (create ? passkey.create({ signal: ac.signal }) : passkey.signIn({ signal: ac.signal }));
      set({ status: "verified" });

      keys = await passkey.deriveKeys(secret);
      secret.prfOutput.fill(0);
      set({ progress: { owner: true, encryption: true, scope: false } });

      // auth.challenge → sign → auth.verify (rules §6, Login 3)
      const client = await getHiveClient();
      const { nonce } = await client.auth.challenge(keys.ownerAddress);
      const signature = await keys.owner.signMessage({ message: authMessage(keys.ownerAddress, nonce) });
      const session = await client.auth.verify({ owner: keys.ownerAddress, nonce, signature });
      const agents = await client.agents.list().catch(() => []);
      if (ac.signal.aborted) throw new PasskeyError("CANCELLED", "Cancelled");

      set({
        status: "signed-in",
        owner: session.owner,
        userToken: session.userToken,
        expiresAt: session.expiresAt,
        keys,
        progress: { owner: true, encryption: true, scope: true },
        destination: agents.some((a) => a.connected) ? "/canvas" : "/connect",
      });
    } catch (e) {
      keys?.end();
      if (e instanceof PasskeyError && e.code === "CANCELLED") {
        set({ ...initial });
        return;
      }
      const error: LoginError =
        e instanceof PasskeyError
          ? { code: e.code, message: e.message }
          : { code: "BRIDGE", message: e instanceof HiveError ? e.message : e instanceof Error ? e.message : String(e) };
      set({ status: "error", error, keys: undefined });
    } finally {
      if (inFlight === ac) inFlight = null;
    }
  },

  /** Login 2 → 1: aborts the open passkey prompt. */
  cancel() {
    inFlight?.abort();
  },

  reset() {
    set({ ...initial, error: undefined });
  },

  async signOut() {
    const { owner, userToken, expiresAt, keys } = get();
    try {
      if (owner && userToken && expiresAt) await (await getHiveClient()).auth.signOut({ owner, userToken, expiresAt });
    } finally {
      keys?.end();
      set({ ...initial, owner: undefined, userToken: undefined, expiresAt: undefined, keys: undefined, destination: undefined, error: undefined });
    }
  },
}));
