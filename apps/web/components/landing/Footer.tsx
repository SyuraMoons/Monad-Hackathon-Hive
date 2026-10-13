import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/cn";
import { gutter } from "./type";

// Footer.
export function Footer() {
  return (
    <footer className={cn(gutter, "flex flex-wrap items-center gap-2 border-t border-line py-7")}>
      <Logo />
      <p className="text-[14px] leading-[1.4] text-ink-3">Your agents share what you let them. Nothing more.</p>
    </footer>
  );
}
