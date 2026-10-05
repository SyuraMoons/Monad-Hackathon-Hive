"use client";

import { useEffect } from "react";

// Sections below the hero rise in as they scroll into view. GSAP loads after the page is idle,
// in its own chunk, so it never competes with first paint. With reduced motion nothing runs.
export function Reveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let dead = false;
    let revert = () => {};

    async function run() {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([import("gsap"), import("gsap/ScrollTrigger")]);
      if (dead) return;
      gsap.registerPlugin(ScrollTrigger);
      const ctx = gsap.context(() => {
        document.querySelectorAll<HTMLElement>("main > section:not(:first-child)").forEach((section) => {
          // Already on screen (a reload halfway down the page): leave it alone rather than flash it.
          if (section.getBoundingClientRect().top < window.innerHeight * 0.82) return;
          // Animate the section's blocks one after another; lists reveal item by item.
          const items = Array.from(section.children).flatMap((el) => (el.matches("ol, ul") ? Array.from(el.children) : [el]));
          gsap.from(items, {
            opacity: 0, y: 28, duration: 0.7, ease: "power3.out", stagger: 0.09, clearProps: "opacity,transform",
            scrollTrigger: { trigger: section, start: "top 82%", once: true },
          });
        });
      });
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
  return null;
}
