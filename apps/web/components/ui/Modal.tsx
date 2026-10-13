"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal: 520 wide, radius 14, ink border, shadow-modal, scrim ink 28%.
 * Esc closes, Tab stays inside, and focus goes back to `returnFocus` (or the previous element) on close.
 */
export function Modal({ labelledBy, onClose, returnFocus, dismissible = true, children }: {
  labelledBy: string;
  onClose(): void;
  /** False blocks Esc and scrim clicks (a transaction is in flight). */
  dismissible?: boolean;
  returnFocus?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const dismissRef = useRef(dismissible);
  dismissRef.current = dismissible;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const target = returnFocus?.current ?? previous;
    const el = dialog.current;
    const first = el?.querySelector<HTMLElement>("[data-autofocus]") ?? el?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (dismissRef.current) closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !el) return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
      if (!items.length) return;
      const [head, tail] = [items[0], items[items.length - 1]];
      if (e.shiftKey && document.activeElement === head) { e.preventDefault(); tail.focus(); }
      else if (!e.shiftKey && document.activeElement === tail) { e.preventDefault(); head.focus(); }
    }
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      target?.focus?.();
    };
  }, [returnFocus]);

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4">
      <div className="hive-scrim absolute inset-0 bg-ink/28 backdrop-blur-[3px]" onClick={() => dismissRef.current && closeRef.current()} aria-hidden="true" />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="hive-modal relative flex w-full max-w-[520px] flex-col gap-[22px] rounded-modal border border-ink bg-paper px-8 py-7 shadow-modal"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
