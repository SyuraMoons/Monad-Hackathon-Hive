import { cn } from "@/lib/cn";
import { gutter } from "./type";

// Figma Section/Positioning 7:5 (Display/H2 Light)
export function Positioning() {
  return (
    <section aria-label="Positioning" className={cn(gutter, "py-[82px] text-center")}>
      <p className="font-display text-[clamp(30px,3.2vw,46px)] leading-[1.18] font-light text-ink">
        <span className="block">LangGraph is the config file.</span>
        <em className="block font-normal italic">Hive is the dashboard.</em>
      </p>
    </section>
  );
}
