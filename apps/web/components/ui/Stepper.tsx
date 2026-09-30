import { Fragment } from "react";
import { cn } from "@/lib/cn";

// Connect 54:90: "✓ Sign in — 2 Connect agents — 3 Canvas".
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center gap-3.5 font-mono text-[14px]" aria-label="Setup progress">
      {steps.map((label, i) => (
        <Fragment key={label}>
          {i > 0 && <li aria-hidden="true" className="text-line">—</li>}
          <li
            aria-current={i === current ? "step" : undefined}
            className={cn("whitespace-pre", i === current ? "font-medium text-ink" : "text-ink-3")}
          >
            {i < current ? `✓ ${label}` : `${i + 1}  ${label}`}
            {i < current && <span className="sr-only"> (done)</span>}
          </li>
        </Fragment>
      ))}
    </ol>
  );
}
