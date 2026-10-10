import { cn } from "@/lib/cn";

export type DotStatus = "active" | "idle" | "revoked" | "pending";

const COLOR: Record<DotStatus, string> = {
  active: "bg-status-active",
  idle: "bg-ink-3",
  revoked: "bg-status-revoked",
  pending: "bg-amber-strong",
};

// Colour alone never carries state (design.md §10), so pass `label` unless visible text says it.
export function StatusDot({ status, size = 8, label, className }: { status: DotStatus; size?: 6 | 8; label?: string; className?: string }) {
  return (
    <span
      className={cn("inline-block shrink-0 rounded-full", size === 8 ? "size-2" : "size-1.5", COLOR[status], className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
