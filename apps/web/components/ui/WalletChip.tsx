import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { shortHash } from "@/lib/format";
import { StatusDot } from "./StatusDot";

// The chip shows the address only; the wallet menu shows the balance.
export function WalletChip({ address, open = false, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { address: string; open?: boolean }) {
  return (
    <button
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={`Wallet ${address}`}
      className={cn(
        "inline-flex h-[34px] cursor-pointer items-center gap-2 rounded-full border bg-paper px-3 font-mono text-[14px] leading-none text-ink",
        open ? "border-ink" : "border-line hover:border-ink-3",
        className,
      )}
      {...rest}
    >
      <StatusDot status="active" />
      <span>{shortHash(address)}</span>
      <span aria-hidden="true" className="text-ink-2">▾</span>
    </button>
  );
}
