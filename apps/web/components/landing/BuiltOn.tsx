import { Fragment } from "react";
import { cn } from "@/lib/cn";
import { eyebrow, gutter } from "./type";

const STACK = ["Monad", "Mera", "Envio", "MCP"];

// Figma Section/Built on 7:10 (Display/Stack Label, enlarged to 52 in the frame)
export function BuiltOn() {
  return (
    <section aria-labelledby="built-on-title" className={cn(gutter, "flex flex-col items-center gap-[34px] py-[88px] text-center")}>
      <h2 id="built-on-title" className={eyebrow}>One graph, wired into the stack agents already trust</h2>
      <ul className="flex flex-wrap items-center justify-center gap-x-[clamp(16px,2.36vw,34px)] gap-y-2 font-display leading-[1.04]">
        {STACK.map((name, i) => (
          <Fragment key={name}>
            {i > 0 && <li aria-hidden="true" className="text-[clamp(28px,2.78vw,40px)] text-clay">·</li>}
            <li className="text-[clamp(34px,3.61vw,52px)] tracking-[-0.01em] text-ink">{name}</li>
          </Fragment>
        ))}
      </ul>
    </section>
  );
}
