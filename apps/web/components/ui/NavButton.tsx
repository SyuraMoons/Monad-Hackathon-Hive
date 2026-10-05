import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

// Figma landing 5:16: outlined mono button, radius 0.
export function NavButton({ className, ...rest }: ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(
        "inline-flex h-10 items-center whitespace-nowrap border border-ink px-[15px] font-mono text-[14px] leading-none font-medium tracking-[0.02em] text-ink no-underline [-webkit-text-fill-color:var(--color-ink)]",
        "transition-colors duration-300 ease-hive hover:bg-ink hover:text-paper hover:[-webkit-text-fill-color:var(--color-paper)] focus-visible:bg-ink focus-visible:text-paper focus-visible:[-webkit-text-fill-color:var(--color-paper)]",
        "max-[720px]:h-[38px]",
        className,
      )}
      {...rest}
    />
  );
}
