import type { OwnerStats } from "@hive/shared";
import { cn } from "@/lib/cn";
import { summarize } from "@/lib/auditStats";

/** Counters and the delivery check, derived by the indexer. Rendered only when the stats loaded: a missing number is not shown as zero. */
export function StatsStrip({ stats }: { stats: OwnerStats }) {
  const { tiles, policy } = summarize(stats);
  return (
    <section aria-label="Audit summary" className="mt-8 flex flex-col gap-3 rounded-card border border-line px-5 py-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="flex flex-col gap-0.5">
            <dt className="font-mono text-[13px] text-ink-3">{t.label}</dt>
            <dd className="text-[24px] leading-tight text-ink tabular-nums">
              {t.value}
              {t.note && <span className="ml-2 font-mono text-[13px] text-ink-3">{t.note}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <p className={cn("flex items-center gap-2 font-mono text-[14px]", policy.ok ? "text-ink-2" : "text-status-revoked")} role={policy.ok ? undefined : "alert"}>
        <span aria-hidden="true" className={cn("size-2 rounded-full", policy.ok ? "bg-status-active" : "bg-status-revoked")} />
        {policy.text}
        <span className="text-ink-3">  ·  checked from indexed events</span>
      </p>
    </section>
  );
}
