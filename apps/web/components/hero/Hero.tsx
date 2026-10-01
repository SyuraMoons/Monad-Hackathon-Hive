"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { PillLink } from "@/components/ui/Pill";
import { Waves } from "@/components/ui/Waves";
import { cn } from "@/lib/cn";
import s from "./Hero.module.css";

// The line under the button, as chips. Icons: a signed edge, an isolated (dashed) node, the hive.
const CHIPS: Array<{ label: string; icon: string; dashed?: boolean }> = [
  { label: "Claude → GPT · work · 30d", icon: "M2 8h10M9 4.5 12.5 8 9 11.5" },
  { label: "Therapy Bot · no edge, no read", icon: "M3 3h10v10H3z", dashed: true },
  { label: "One graph, your permissions", icon: "M8 1.8 13.4 4.9v6.2L8 14.2 2.6 11.1V4.9z" },
];

const INK = "#171512", INK_3 = "#6B665B", AMBER = "#A86E00";
const X0 = 298, X1 = 392, TIP = 402;     // the edge runs from Claude's right side to GPT's left side

const step = (i: number) => ({ "--i": i }) as CSSProperties;

// Figma hero 5:22. The graph is drawn in its signed state, so it is complete without JavaScript
// and with reduced motion. GSAP then loops the story: memory flows, the edge is revoked, redrawn and signed.
export function Hero() {
  const sectionRef = useRef<HTMLElement>(null);
  const graphRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const section = sectionRef.current, graph = graphRef.current;
    if (!section || !graph || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let dead = false;
    let revert = () => {};

    async function run() {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([import("gsap"), import("gsap/ScrollTrigger")]);
      if (dead) return;
      gsap.registerPlugin(ScrollTrigger);
      const ctx = gsap.context(() => {
        const q = gsap.utils.selector(graph);
        const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.4, paused: true, delay: 1.2 });

        // 1. Memory flows along the signed edge: two pulses, and GPT's border flashes as each lands (600 ms ease-out).
        for (const at of [0, 0.9]) {
          tl.fromTo(q("[data-g=dot], [data-g=glow]"), { attr: { cx: X0 } }, { attr: { cx: TIP }, duration: 0.6, ease: "power3.out" }, at)
            .fromTo(q("[data-g=dot]"), { opacity: 0 }, { opacity: 1, duration: 0.08 }, at)
            .fromTo(q("[data-g=glow]"), { opacity: 0 }, { opacity: 0.22, duration: 0.08 }, at)
            .to(q("[data-g=dot], [data-g=glow]"), { opacity: 0, duration: 0.14 }, at + 0.5)
            .to(q("[data-g=gpt]"), { attr: { stroke: AMBER, "stroke-width": 2.25 }, duration: 0.18, repeat: 1, yoyo: true }, at + 0.48);
        }

        // 2. The edge is revoked: the tag leaves, the solid line pulls back, the dashes return.
        tl.to(q("[data-g=tag], [data-g=leader]"), { opacity: 0, duration: 0.3, ease: "power2.in" }, "+=1.6")
          .set(q("[data-g=dash]"), { opacity: 1, attr: { x1: X0 } })
          .to(q("[data-g=solid]"), { attr: { x2: X0 }, duration: 0.45, ease: "power2.inOut" })
          .to(q("[data-g=arrow]"), { attr: { fill: INK_3 }, duration: 0.2 }, "<0.2")
          .fromTo(q("[data-g=dash]"), { attr: { "stroke-dashoffset": 0 } }, { attr: { "stroke-dashoffset": -40 }, duration: 1.3, ease: "none" });

        // 3. It is drawn and signed again: the line fills in, a ripple marks the signature, the tag settles (250 ms).
        tl.to(q("[data-g=solid]"), { attr: { x2: X1 }, duration: 0.8, ease: "power2.inOut" })
          .to(q("[data-g=dash]"), { attr: { x1: X1 }, duration: 0.8, ease: "power2.inOut" }, "<")
          .to(q("[data-g=arrow]"), { attr: { fill: INK }, duration: 0.2 }, ">-0.2")
          .set(q("[data-g=dash]"), { opacity: 0 })
          .fromTo(q("[data-g=ripple]"), { attr: { r: 4 }, opacity: 0.55 }, { attr: { r: 44 }, opacity: 0, duration: 0.7, ease: "power2.out", immediateRender: false })
          .fromTo(q("[data-g=tag]"), { opacity: 0, scale: 0.96, transformOrigin: "50% 0%" }, { opacity: 1, scale: 1, duration: 0.25, ease: "power2.out", immediateRender: false }, "<0.1")
          .to(q("[data-g=leader]"), { opacity: 0.45, duration: 0.25 }, "<");

        // Only run while the hero is on screen.
        ScrollTrigger.create({ trigger: section, start: "top bottom", end: "bottom top", onToggle: (self) => (self.isActive ? tl.play() : tl.pause()) });
      }, section!);
      revert = () => ctx.revert();
    }

    const useIdle = typeof window.requestIdleCallback === "function";
    const id = useIdle ? window.requestIdleCallback(() => void run(), { timeout: 2500 }) : window.setTimeout(() => void run(), 600);
    return () => {
      dead = true;
      if (useIdle) window.cancelIdleCallback(id);
      else clearTimeout(id);
      revert();
    };
  }, []);

  return (
    <section ref={sectionRef} className={s.hero} aria-label="Hive introduction">
      <Waves />
      <p className={cn(s.eyebrow, s.rise)} style={step(0)}>Hive · Agent memory, on Monad</p>
      <h1 className={cn(s.h1, s.rise)} style={step(1)}>Connect at will.<br />Isolate by <em>default</em></h1>
      <p className={cn(s.lead, s.rise)} style={step(2)}>
        One MCP that carries memory across the models you use. Draw a permission, and only that topic flows. Draw nothing, and nothing leaks.
      </p>

      <svg
        ref={graphRef}
        className={cn(s.graph, s.rise)}
        style={step(3)}
        viewBox="128 0 444 200"
        role="img"
        aria-label="Claude shares the work topic with GPT over a signed edge. Therapy Bot has no edge, so it reads nothing."
      >
        {/* Claude and GPT: connected nodes (1.5 ink stroke, 3px amber-strong bar) */}
        <rect x="140.75" y="8.75" width="150.5" height="62.5" fill="#F4F2EC" stroke={INK} strokeWidth="1.5" />
        <rect x="140" y="8" width="3" height="64" fill={AMBER} />
        <image href="/agents/claude.png" x="169.5" y="29" width="22" height="22" />
        <text className={s.name} x="202.5" y="47">Claude</text>

        <rect data-g="gpt" x="408.75" y="8.75" width="150.5" height="62.5" fill="#F4F2EC" stroke={INK} strokeWidth="1.5" />
        <rect x="408" y="8" width="3" height="64" fill={AMBER} />
        <image href="/agents/gpt.png" x="448.5" y="29" width="22" height="22" />
        <text className={s.name} x="481.5" y="47">GPT</text>

        {/* Therapy Bot: isolated, and never animated */}
        <rect x="140.65" y="128.65" width="168.3" height="62.7" fill="#ECE9E1" stroke="#B7B0A0" strokeWidth="1.3" strokeDasharray="4 4" />
        <text className={cn(s.name, s.muted)} x="159.3" y="156">Therapy Bot</text>
        <text className={s.mono} x="159.3" y="178">no edge, no read</text>

        {/* edge: dashed (unsigned) under solid (signed) */}
        <line data-g="dash" x1={X1} y1="40" x2={X1} y2="40" stroke={INK_3} strokeWidth="1.5" strokeDasharray="5 5" opacity="0" />
        <line data-g="solid" x1={X0} y1="40" x2={X1} y2="40" stroke={INK} strokeWidth="2" />
        <path data-g="arrow" d="M394 35.5 L402 40 L394 44.5 Z" fill={INK} />

        <circle data-g="ripple" cx="350" cy="40" r="4" fill="none" stroke={AMBER} strokeWidth="1.4" opacity="0" />
        <line data-g="leader" x1="350" y1="44" x2="350" y2="84" stroke={AMBER} strokeWidth="1" opacity=".45" />
        <g data-g="tag">
          <rect x="237.5" y="84.5" width="225" height="29" rx="6" fill="#ECE9E1" stroke={AMBER} />
          <text className={s.tagText} x="350" y="104" textAnchor="middle">work  ·  30d  ·  signed <tspan className={s.tick}>✓</tspan></text>
        </g>

        <circle data-g="glow" cx={X0} cy="40" r="13" fill={AMBER} opacity="0" />
        <circle data-g="dot" cx={X0} cy="40" r="6" fill={AMBER} opacity="0" />
      </svg>

      <div className={cn(s.cta, s.rise)} style={step(4)}>
        <PillLink href="/login">Get started with a passkey</PillLink>
      </div>
      <ul className={cn(s.chips, s.rise)} style={step(5)}>
        {CHIPS.map((c) => (
          <li key={c.label} className={s.chip}>
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={c.icon} strokeDasharray={c.dashed ? "2 2.4" : undefined} />
            </svg>
            {c.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
