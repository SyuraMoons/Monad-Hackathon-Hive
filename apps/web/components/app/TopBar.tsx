"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { WalletChip } from "@/components/ui/WalletChip";
import { useSession } from "@/lib/stores/session";
import { useUi } from "@/lib/stores/ui";

const CRUMBS: Record<string, string> = {
  "/connect": "Connect agents",
  "/canvas": "My graph",
  "/audit": "Audit trail",
};

// Figma Canvas top bar 55:47: 56px, bottom border line.
export function TopBar() {
  const pathname = usePathname();
  const owner = useSession((s) => s.owner);
  const mode = useSession((s) => s.mode);
  const walletMenu = useUi((s) => s.walletMenu);
  const setUi = useUi((s) => s.set);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line bg-paper px-6">
      <div className="flex items-center gap-3">
        <Link href="/" aria-label="Hive home" className="inline-flex min-h-9 items-center">
          <Logo />
        </Link>
        <p className="font-mono text-[14px] whitespace-pre text-ink-3">
          <span aria-hidden="true">/   </span>
          {CRUMBS[pathname] ?? ""}
        </p>
      </div>
      <div className="flex items-center gap-3">
        {mode === "mock" && (
          // AGENTS.md rule 8: say plainly that this is not real chain data.
          <span className="inline-flex h-[30px] items-center gap-2 rounded-full border border-line bg-paper-2 px-3 font-mono text-[14px] text-ink-2" title="Development mock data: nothing here is onchain">
            Demo data
          </span>
        )}
        {owner && <WalletChip address={owner} open={walletMenu} onClick={() => setUi({ walletMenu: !walletMenu })} />}
      </div>
    </header>
  );
}
