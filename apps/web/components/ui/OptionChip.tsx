import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

// Edge editor 56:407: h 36, radius 999, Mono 14. Audit filters (62:179) use the body font.
export function OptionChip({ selected = false, font = "mono", className, type = "button", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; font?: "mono" | "body" }) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cn(
        "inline-flex h-9 cursor-pointer items-center gap-2 rounded-full px-[14px] text-[14px] leading-none transition-colors duration-200 ease-hive",
        font === "mono" ? "font-mono" : "font-body",
        selected ? "bg-ink font-medium text-paper" : "border border-line bg-paper text-ink hover:border-ink-3",
        "disabled:cursor-not-allowed disabled:opacity-45",
        className,
      )}
      {...rest}
    />
  );
}
