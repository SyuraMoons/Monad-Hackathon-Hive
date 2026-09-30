"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { Stepper } from "@/components/ui/Stepper";
import { WalletChip } from "@/components/ui/WalletChip";
import { ZoneToggle } from "@/components/ui/ZoneToggle";
import { WalletMenu } from "./WalletMenu";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/stores/session";
import { useUi } from "@/lib/stores/ui";

const CRUMBS: Record<string, string> = {
  "/canvas": "My graph",
  "/audit": "Audit trail",
};

// Canvas/Audit: 56px bar with a bottom border (55:47). Connect: transparent over the waves, with the stepper (54:90).
export function TopBar() {
  const pathname = usePathname();
  const onboarding = pathname === "/connect";
  const owner = useSession((s) => s.owner);
  const mode = useSession((s) => s.mode);
  const walletMenu = useUi((s) => s.walletMenu);
  const zones = useUi((s) => s.zones);
  const setUi = useUi((s) => s.set);

  return (
    <header
      className={cn(
        "relative z-10 flex h-14 shrink-0 items-center justify-between gap-4",
        onboarding ? "px-[clamp(16px,4.4444vw,64px)]" : "border-b border-line bg-paper px-6",
      )}
    >
      <div className="flex items-center gap-3">
        <Link href="/" aria-label="Hive home" className="inline-flex min-h-9 items-center">
          <Logo />
        </Link>
        {!onboarding && (
          <p className="font-mono text-[14px] whitespace-pre text-ink-3">
            <span aria-hidden="true">/   </span>
            {CRUMBS[pathname] ?? ""}
          </p>
        )}
      </div>
      {onboarding && (
        <nav className="absolute left-1/2 -translate-x-1/2 max-[900px]:hidden" aria-label="Setup">
          <Stepper steps={["Sign in", "Connect agents", "Canvas"]} current={1} />
        </nav>
      )}
      <div className="flex items-center gap-3">
        {mode === "mock" && (
          // AGENTS.md rule 8: say plainly that this is not real chain data.
          <span className="inline-flex h-[30px] items-center gap-2 rounded-full border border-line bg-paper-2 px-3 font-mono text-[14px] text-ink-2" title="Development mock data: nothing here is onchain">
            Demo data
          </span>
        )}
        {pathname === "/canvas" && <ZoneToggle on={zones} onChange={(on) => setUi({ zones: on })} />}
        {owner && (
          <div className="relative">
            <WalletChip address={owner} open={walletMenu} onClick={() => setUi({ walletMenu: !walletMenu })} />
            {walletMenu && <WalletMenu address={owner} />}
          </div>
        )}
      </div>
    </header>
  );
}
