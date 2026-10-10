"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import type { Address } from "@hive/shared";
import { getHiveClient } from "@/lib/hive/client";
import { pulses } from "@/lib/pulse";
import { useFeed } from "@/lib/stores/feed";
import { useGraph } from "@/lib/stores/graph";
import { useSession } from "@/lib/stores/session";
import { useUi } from "@/lib/stores/ui";
import { Waves } from "@/components/ui/Waves";
import { TopBar } from "./TopBar";

/** Fills the stores from the HiveClient once signed in. Screens only ever read the stores. */
function useHiveBootstrap(owner: Address | undefined) {
  useEffect(() => {
    if (!owner) return;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    void useGraph.getState().load(owner);
    void getHiveClient().then((client) => {
      if (cancelled) return;
      unsubscribe = client.events.subscribe(
        (event) => {
          useGraph.getState().applyEvent(event);
          useFeed.getState().applyEvent(event);
          pulses.fromEvent(event);
        },
        (bridge) => {
          useUi.getState().set({ bridge });
          // Events sent while the stream was down are not replayed to the stores: re-read who is connected.
          if (bridge === "open") void useGraph.getState().refreshAgents().catch(() => {});
        },
      );
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
      useGraph.getState().reset();
      useFeed.getState().reset();
    };
  }, [owner]);
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const status = useSession((s) => s.status);
  const owner = useSession((s) => s.owner);
  const restored = useSession((s) => s.restored);
  const signedIn = status === "signed-in" && !!owner;

  // A reload keeps the saved session (ADR-011): ask for it before deciding the user is signed out.
  useEffect(() => {
    void useSession.getState().restore();
  }, []);

  useEffect(() => {
    if (restored && !signedIn) router.replace(useSession.getState().signedOutOnPurpose ? "/" : `/login?next=${encodeURIComponent(pathname)}`);
  }, [restored, signedIn, pathname, router]);

  useHiveBootstrap(signedIn ? owner : undefined);

  // Esc closes the innermost open layer (design.md §10). Modals handle their own Esc first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && useUi.getState().closeLayers()) e.preventDefault(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (!signedIn) return null;

  return (
    <div className="relative flex min-h-svh flex-col overflow-x-hidden">
      {pathname === "/connect" && <Waves />}
      <TopBar />
      {/* design.md §7: the app routes need a laptop-sized screen */}
      <p className="grid flex-1 place-items-center px-6 text-center text-[17px] text-ink-2 lg:hidden">
        Hive&rsquo;s canvas works best on a laptop.
      </p>
      <div className="flex min-h-0 flex-1 flex-col max-lg:hidden">{children}</div>
    </div>
  );
}
