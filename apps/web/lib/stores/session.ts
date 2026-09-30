"use client";

import { HiveError, zAddress, zUnixSeconds, type Address } from "@hive/shared";
import { z } from "zod";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { getHiveClient, HIVE_MODE } from "@/lib/hive/client";
import type { HiveMode } from "@/lib/hive/types";

type Status = "signed-out" | "signing-in" | "signed-in" | "error";

type SessionState = {
  status: Status;
  owner?: Address;
  userToken?: string;
  expiresAt?: number;
  error?: { code: string; message: string };
  mode: HiveMode;
  hydrated: boolean;
  signIn(): Promise<boolean>;
  signOut(): Promise<void>;
};

// Only the bridge user token survives a reload (sessionStorage, this tab only). Keys derived from the passkey never do.
const zPersisted = z.object({ owner: zAddress, userToken: z.string().min(1), expiresAt: zUnixSeconds });

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      status: "signed-out",
      mode: HIVE_MODE,
      hydrated: false,
      async signIn() {
        set({ status: "signing-in", error: undefined });
        try {
          const client = await getHiveClient();
          const s = await client.auth.signIn();
          set({ status: "signed-in", owner: s.owner, userToken: s.userToken, expiresAt: s.expiresAt });
          return true;
        } catch (e) {
          const err = e instanceof HiveError ? { code: e.code, message: e.message } : { code: "INTERNAL", message: String(e) };
          set({ status: "error", error: err });
          return false;
        }
      },
      async signOut() {
        const { owner, userToken, expiresAt } = get();
        try {
          if (owner && userToken && expiresAt) await (await getHiveClient()).auth.signOut({ owner, userToken, expiresAt });
        } finally {
          set({ status: "signed-out", owner: undefined, userToken: undefined, expiresAt: undefined, error: undefined });
        }
      },
    }),
    {
      name: "hive-session",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ owner: s.owner, userToken: s.userToken, expiresAt: s.expiresAt }),
      merge: (persisted, current) => {
        const p = zPersisted.safeParse(persisted);
        if (!p.success || p.data.expiresAt <= Date.now() / 1000) return current;
        return { ...current, ...p.data, status: "signed-in" };
      },
    },
  ),
);

// sessionStorage hydrates synchronously during create(), so check both orders.
if (typeof window !== "undefined") {
  const markHydrated = () => useSession.setState({ hydrated: true });
  if (useSession.persist.hasHydrated()) markHydrated();
  else useSession.persist.onFinishHydration(markHydrated);
}
