import { cn } from "@/lib/cn";
import { DottedDivider } from "./DottedDivider";
import { anchor, gutter, h2 } from "./type";

const STEPS = [
  {
    n: "01",
    title: "Draw",
    body: "Drop your agents onto the canvas and draw an edge between the two you want to share memory. You set the topic and how long the edge lasts.",
  },
  {
    n: "02",
    title: "Sign with your passkey",
    body: "Each permission is signed with your passkey and written to Monad. There is no wallet to install and no seed phrase to keep.",
  },
  {
    n: "03",
    title: "Watch it flow",
    body: "When one agent learns something, it travels along the edge you drew to the next. The agents you did not connect learn nothing.",
  },
];

// How it works section.
export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className={cn(anchor, "pt-[84px] pb-5")}>
      <h2 id="how-title" className={cn(gutter, h2)}>Three steps. No configuration files.</h2>
      <ol className="mt-[50px]">
        {STEPS.map((step, i) => (
          <li key={step.n}>
            {i > 0 && <DottedDivider />}
            <div className={cn(gutter, i === 0 ? "pb-[34px]" : "py-[34px]")}>
              <div className="grid grid-cols-[54px_1fr] gap-x-6 gap-y-3 md:grid-cols-[54px_230px_minmax(0,700px)] md:gap-x-11">
                <span className="font-display text-[38px] leading-none font-light text-amber-strong" aria-hidden="true">{step.n}</span>
                <h3 className="font-display text-[25px] leading-[1.1] font-normal text-ink">
                  <span className="sr-only">Step {Number(step.n)}: </span>
                  {step.title}
                </h3>
                <p className="col-start-2 text-[17px] leading-[1.55] text-ink-2 md:col-start-3 md:row-start-1">{step.body}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
