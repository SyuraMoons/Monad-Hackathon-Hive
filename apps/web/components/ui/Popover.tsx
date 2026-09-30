"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A non-modal floating card (menus, confirm cards). Closes on an outside pointer-down, moves focus in on open
 * and back to whatever had it on close. Esc is handled by the owner (ui.closeLayers).
 */
export function Popover({ onClose, className, style, role, label, children, autoFocusSelector }: {
  onClose(): void;
  className?: string;
  style?: CSSProperties;
  role?: "menu" | "dialog" | "alertdialog";
  label?: string;
  autoFocusSelector?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const el = ref.current;
    (el?.querySelector<HTMLElement>(autoFocusSelector ?? "[data-autofocus], button, a[href]") ?? el)?.focus();
    function onDown(e: PointerEvent) {
      if (el && !el.contains(e.target as Node)) closeRef.current();
    }
    // capture so React Flow's pane handlers can't swallow it
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      if (previous?.isConnected) previous.focus();
    };
  }, [autoFocusSelector]);

  return (
    <div ref={ref} role={role} aria-label={label} tabIndex={-1} className={cn("hive-modal absolute z-30 focus:outline-none", className)} style={style}>
      {children}
    </div>
  );
}
