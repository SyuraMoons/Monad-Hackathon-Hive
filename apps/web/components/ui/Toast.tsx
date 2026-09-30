import { cn } from "@/lib/cn";
import { StatusDot, type DotStatus } from "./StatusDot";

export type ToastStatus = "pending" | "success" | "revoked" | "error";

const DOT: Record<ToastStatus, DotStatus> = {
  pending: "idle",
  success: "active",
  revoked: "revoked",
  error: "revoked",
};

// Visual only for now (step 1). Canvas 55:46: h 42, radius 10, ink surface, amber link.
export function Toast({ status, message, link, className }: {
  status: ToastStatus;
  message: string;
  link?: { href: string; label: string };
  className?: string;
}) {
  return (
    <div
      role={status === "error" ? "alert" : "status"}
      className={cn(
        "inline-flex h-[42px] items-center gap-[14px] rounded-card bg-ink py-3 pr-[18px] pl-4 text-[15px] leading-none font-medium text-paper shadow-toast",
        className,
      )}
    >
      <StatusDot status={DOT[status]} />
      <span className="whitespace-nowrap">{message}</span>
      {link && (
        <a href={link.href} target="_blank" rel="noreferrer" className="whitespace-nowrap text-amber underline-offset-4 hover:underline focus-visible:outline-paper">
          {link.label}
        </a>
      )}
    </div>
  );
}
