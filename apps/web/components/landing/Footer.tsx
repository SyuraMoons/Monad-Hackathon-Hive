import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/cn";
import { gutter } from "./type";

// Figma Footer 7:28
export function Footer() {
  return (
    <footer className={cn(gutter, "flex flex-col items-start gap-3 border-t border-line py-7 sm:flex-row sm:items-center sm:justify-between")}>
      <div className="flex flex-wrap items-center gap-2">
        <Logo />
        <p className="text-[14px] leading-[1.4] text-ink-3">Your agents share what you let them. Nothing more.</p>
      </div>
      <p className="font-mono text-[14px] leading-[1.4] text-ink-3">Monad Metropolis · Track 4</p>
    </footer>
  );
}
