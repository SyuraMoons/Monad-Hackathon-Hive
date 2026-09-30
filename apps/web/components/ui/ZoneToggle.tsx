import { cn } from "@/lib/cn";

// design.md §6 Isolation toggle: h 33 pill, 28 × 16 switch; off = clay track, on = amber-strong track and border.
export function ZoneToggle({ on, onChange }: { on: boolean; onChange(on: boolean): void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cn(
        "inline-flex h-[33px] cursor-pointer items-center gap-2 rounded-full border px-3 text-[14px] text-ink-2 hover:text-ink",
        on ? "border-amber-strong" : "border-line",
      )}
    >
      <span aria-hidden="true" className={cn("relative h-4 w-7 rounded-full transition-colors duration-200", on ? "bg-amber-strong" : "bg-clay")}>
        <span className={cn("absolute top-0.5 size-3 rounded-full bg-paper transition-[left] duration-200 ease-hive", on ? "left-[14px]" : "left-0.5")} />
      </span>
      Isolation zones
    </button>
  );
}
