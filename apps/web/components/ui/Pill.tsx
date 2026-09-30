import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { cn } from "@/lib/cn";
import s from "./Pill.module.css";

type Variant = "default" | "danger";

// Figma Button/Pill 4:2: dark pill, paper label, amber arrow.
function Arrow() {
  return (
    <svg className={s.arrow} width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true">
      <line x1="1" y1="7.6" x2="14" y2="7.6" strokeWidth="1.8" />
      <line x1="9.6364" y1="3.3636" x2="14.5861" y2="8.31335" strokeWidth="1.8" />
      <line x1="8.3636" y1="12.3636" x2="13.3134" y2="7.41386" strokeWidth="1.8" />
    </svg>
  );
}

type PillButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; arrow?: boolean };

export function PillButton({ variant = "default", arrow = true, className, children, type = "button", ...rest }: PillButtonProps) {
  return (
    <button type={type} className={cn(s.pill, variant === "danger" && s.danger, className)} {...rest}>
      {children}
      {arrow && <Arrow />}
    </button>
  );
}

type PillLinkProps = ComponentProps<typeof Link> & { variant?: Variant; arrow?: boolean };

export function PillLink({ variant = "default", arrow = true, className, children, ...rest }: PillLinkProps) {
  return (
    <Link className={cn(s.pill, variant === "danger" && s.danger, className)} {...rest}>
      {children}
      {arrow && <Arrow />}
    </Link>
  );
}
