import { cn } from "@/lib/cn";
import { anchor, eyebrow, gutter, h2, lead } from "./type";

const ROWS: Array<{ key: string; value: string; topic?: boolean }> = [
  { key: "from", value: "claude" },
  { key: "to", value: "gpt" },
  { key: "topic", value: '"work"', topic: true },
  { key: "grant", value: "push, expires 30d" },
  { key: "signed", value: "passkey" },
];

// Isolation section.
export function Isolation() {
  return (
    <section
      id="isolation"
      aria-labelledby="isolation-title"
      className={cn(anchor, gutter, "flex flex-col items-start gap-12 py-[78px] min-[1100px]:flex-row min-[1100px]:items-center min-[1100px]:gap-20")}
    >
      <div className="flex min-w-0 flex-1 flex-col items-start gap-[22px]">
        <p className={eyebrow}>The difference</p>
        <h2 id="isolation-title" className={h2}>
          <span className="md:block">Isolation is the feature,</span>{" "}
          <span className="md:block">not a setting you find later.</span>
        </h2>
        <p className={cn(lead, "max-w-[560px]")}>
          Shared memory pools leak. Hive is a knowledge graph, so an agent only ever sees the topics you drew an edge for.
          Your therapy bot never touches your work context, and your work agents never see it.
        </p>
        <p className="font-display text-[22px] leading-[1.1] italic text-ink">You own the graph. Not the AI companies.</p>
      </div>

      <figure className="w-full shrink-0 border border-line bg-paper-2 px-[30px] py-8 min-[1100px]:w-[500px]">
        <figcaption className="font-mono text-[14px] leading-[1.5] tracking-[0.04em] text-ink-3">what one edge writes on-chain</figcaption>
        <dl className="mt-5 font-mono text-[14.5px] leading-[2]">
          {ROWS.map((r) => (
            <div key={r.key} className="flex gap-2">
              <dt className="w-16 shrink-0 text-ink-3">{r.key}</dt>
              <dd className="text-ink">
                {/* Topic names as text stay in ink inside a border of the topic colour. */}
                {r.topic ? <span className="rounded-tag border border-topic-work px-1.5 py-px">{r.value}</span> : r.value}
              </dd>
            </div>
          ))}
        </dl>
      </figure>
    </section>
  );
}
