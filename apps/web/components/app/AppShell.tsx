"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import type { Address } from "@hive/shared";
import { getHiveClient } from "@/lib/hive/client";
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
        },
        (bridge) => useUi.getState().set({ bridge }),
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
  const signedIn = status === "signed-in" && !!owner;

  useEffect(() => {
    if (!signedIn) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [signedIn, pathname, router]);

  useHiveBootstrap(signedIn ? owner : undefined);

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
