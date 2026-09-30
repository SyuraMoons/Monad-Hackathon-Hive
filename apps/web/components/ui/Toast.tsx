import { cn } from "@/lib/cn";
import { StatusDot, type DotStatus } from "./StatusDot";

export type ToastStatus = "pending" | "success" | "revoked" | "error";

const DOT: Record<ToastStatus, DotStatus> = {
  pending: "idle",
  success: "active",
  revoked: "revoked",
  error: "revoked",
};

// Canvas 55:46: h 42, radius 10, ink surface, amber link. Errors persist and get a dismiss button.
export function Toast({ status, message, link, onDismiss, className }: {
  status: ToastStatus;
  message: string;
  link?: { href: string; label: string };
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <div
      role={status === "error" ? "alert" : "status"}
      className={cn(
        "hive-toast inline-flex min-h-[42px] max-w-full items-center gap-[14px] rounded-card bg-ink py-3 pr-[18px] pl-4 text-[15px] leading-snug font-medium text-paper shadow-toast",
        className,
      )}
    >
      <StatusDot status={DOT[status]} />
      <span className="min-w-0 whitespace-pre-wrap">{message}</span>
      {link && (
        <a href={link.href} target="_blank" rel="noreferrer" className="shrink-0 whitespace-nowrap text-amber underline underline-offset-4 focus-visible:outline-paper">
          {link.label}
        </a>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-my-2 -mr-2 grid size-9 shrink-0 cursor-pointer place-items-center rounded-chip text-paper/80 hover:bg-paper/10 hover:text-paper focus-visible:outline-paper"
        >
          ✕
        </button>
      )}
    </div>
  );
}
