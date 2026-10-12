"use client";

import { Toast } from "@/components/ui/Toast";
import { useUi } from "@/lib/stores/ui";

// Top-centre stack over the canvas. Success auto-dismisses after 4 s (ui store); errors persist.
export function Toaster() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismissToast);
  return (
    <div className="pointer-events-none absolute top-6 right-4 left-4 z-40 flex flex-col items-center gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto max-w-full">
          <Toast status={t.status} message={t.message} link={t.link} onDismiss={t.status === "error" ? () => dismiss(t.id) : undefined} />
        </div>
      ))}
    </div>
  );
}
