import { PillLink } from "@/components/ui/Pill";
import { cn } from "@/lib/cn";
import { gutter } from "./type";

// Figma Section/Closing 7:20
export function Closing() {
  return (
    <section
      aria-labelledby="closing-title"
      className={cn(gutter, "flex flex-col items-start gap-8 py-[88px] md:flex-row md:items-end md:justify-between")}
    >
      <h2 id="closing-title" className="font-display text-[clamp(36px,3.89vw,56px)] leading-[1.04] font-normal tracking-[-0.01em] text-ink">
        <span className="md:block">Give your agents a memory</span>{" "}
        <span className="md:block">you actually control.</span>
      </h2>
      <PillLink href="/login" className="shrink-0">Get started with a passkey</PillLink>
    </section>
  );
}
