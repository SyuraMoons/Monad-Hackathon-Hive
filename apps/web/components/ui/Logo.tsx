import { cn } from "@/lib/cn";

// Figma Logo 13:23: hex mark + "Hive" (Display/Wordmark), 84 × 26.
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
        <path d="M12 2L20.66 7V17L12 22L3.34 17V7L12 2Z" className="stroke-ink" strokeWidth="1.8" />
        <path d="M12 7.4L15.98 9.7V14.3L12 16.6L8.02 14.3V9.7L12 7.4Z" className="fill-amber" />
      </svg>
      <span className="font-display text-[21px] leading-none font-semibold tracking-[0.01em] text-ink">Hive</span>
    </span>
  );
}
