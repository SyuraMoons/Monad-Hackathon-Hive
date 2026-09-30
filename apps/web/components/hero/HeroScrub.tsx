"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { PillLink } from "@/components/ui/Pill";
import { cn } from "@/lib/cn";
import s from "./HeroScrub.module.css";

// Same-origin, so fetch() has no CORS issues. The clip is all-intra (every frame is a keyframe),
// which is why the scrub can land on an exact frame instead of the nearest keyframe.
const VIDEO_MP4 = "/hero/hero-scrub.mp4";
const VIDEO_WEBM = "/hero/hero-scrub.webm"; // for browsers without H.264 (some Linux Chromium / Firefox builds)

type Panel = { eyebrow: string; title: ReactNode; lead: string; cta?: string; stillAlt: string };

const PANELS: Panel[] = [
  {
    eyebrow: "Hive · Agent memory, on Monad",
    title: <>Connect at will.<br />Isolate by <em>default</em></>,
    lead: "One MCP that carries memory across the models you use. Draw a permission, and only that topic flows. Draw nothing, and nothing leaks.",
    cta: "Get started with a passkey",
    stillAlt: "Claude, GPT and Therapy Bot, with no permissions yet.",
  },
  {
    eyebrow: "Step 01 · Draw and sign",
    title: <>Draw an edge.<br />Sign it <em>once</em>.</>,
    lead: "Pick two agents, a topic, and how long it lasts. Your passkey signs it, and the permission is written to Monad.",
    stillAlt: "A signed work edge from Claude to GPT.",
  },
  {
    eyebrow: "Step 02 · Watch it flow",
    title: <>GPT knows.<br />Therapy Bot <em>doesn&rsquo;t</em>.</>,
    lead: "Memory moves only along the edges you signed. No edge, and nothing reaches it. The proof is onchain.",
    cta: "Get started with a passkey",
    stillAlt: "Memory flowing from Claude to GPT while Therapy Bot stays isolated.",
  },
];

// [fadeInStart, fadeInEnd, fadeOutStart, fadeOutEnd]
// The gaps between one panel's fadeOutEnd and the next panel's fadeInStart are
// dead zones (video only), so two panels are never readable at once.
const CUES = [
  [0.00, 0.00, 0.15, 0.23],
  [0.35, 0.43, 0.57, 0.65],
  [0.77, 0.85, 1.10, 1.20],  // never fades out: P3 is still showing when the section releases
] as const;
const DRIFT = 22;            // px of counter-scroll travel per panel

const STATIC_QUERY = "(prefers-reduced-motion: reduce), (max-width: 720px), (max-height: 600px) and (orientation: landscape)";

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (t: number) => t * t * (3 - 2 * t);
const ramp = (p: number, a: number, b: number) => (b <= a ? (p >= b ? 1 : 0) : smooth(clamp((p - a) / (b - a), 0, 1)));

function pickVideo(clip: HTMLVideoElement): { url: string; type: string } {
  if (clip.canPlayType('video/mp4; codecs="avc1.640028"')) return { url: VIDEO_MP4, type: "video/mp4" };
  if (clip.canPlayType('video/webm; codecs="vp9"')) return { url: VIDEO_WEBM, type: "video/webm" };
  return { url: VIDEO_MP4, type: "video/mp4" };
}

function Waves() {
  return (
    <div className={s.waves} aria-hidden="true">
      <svg height="300" viewBox="0 0 1440 300" preserveAspectRatio="none">
        <path className={s.wave1} d="M0 300C240 180 480 150 720 210C960 270 1200 250 1440 190V0H0V300Z" />
      </svg>
      <svg height="248.571" viewBox="0 0 1440 248.571" preserveAspectRatio="none">
        <path className={s.wave1} d="M0 68.5714C240 -11.4286 520 -21.4286 760 38.5714C1000 98.5714 1220 78.5714 1440 18.5714V248.571H0V68.5714Z" />
      </svg>
      <svg height="190.859" viewBox="0 0 1440 190.859" preserveAspectRatio="none">
        <path className={s.wave3} d="M0 60.8587C260 -9.14131 540 -19.1413 780 32.8587C1020 84.8587 1240 62.8587 1440 10.8587V190.859H0V60.8587Z" />
      </svg>
    </div>
  );
}

export function HeroScrub() {
  const sectionRef = useRef<HTMLElement>(null);
  const graphRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<HTMLVideoElement>(null);
  const meterRef = useRef<HTMLElement>(null);
  const panelRefs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    const section = sectionRef.current;
    const graph = graphRef.current;
    const clip = clipRef.current;
    const meter = meterRef.current;
    const panels = panelRefs.current.filter((el): el is HTMLElement => el !== null);
    if (!section || !graph || !clip || !meter || panels.length !== PANELS.length) return;

    const staticMq = window.matchMedia(STATIC_QUERY);
    const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
    let teardown: () => void = () => {};

    // Static mode: every panel is plain, focusable content. Nothing scrubs and nothing downloads.
    function enterStatic() {
      section!.classList.add(s.static);
      panels.forEach((el) => {
        el.removeAttribute("aria-hidden");
        el.style.opacity = "";
        el.style.transform = "";
        el.style.pointerEvents = "";
        el.querySelectorAll("a").forEach((a) => a.removeAttribute("tabindex"));
      });
    }

    function setupScrub(): () => void {
      section!.classList.remove(s.static);

      let progress = 0;
      let duration = 0;
      let seekTo = 0;
      let seekAt = 0;
      let ready = false;
      let running = false;
      let raf = 0;
      let attached = false;
      let fellBack = false;
      let disposed = false;
      let blobUrl: string | null = null;
      const lastHidden = panels.map((_, i) => i !== 0);
      const timers: number[] = [];
      const abort = new AbortController();
      const video = pickVideo(clip!);

      function readScroll() {
        const r = section!.getBoundingClientRect();
        const max = r.height - window.innerHeight;
        progress = max > 0 ? clamp(-r.top / max, 0, 1) : 0;
        if (duration) seekTo = progress * duration;
      }

      function paint() {
        if (ready) meter!.style.transform = `scaleX(${progress})`;
        panels.forEach((el, i) => {
          const c = CUES[i], enter = ramp(progress, c[0], c[1]), leave = ramp(progress, c[2], c[3]);
          const o = enter * (1 - leave), y = (1 - enter) * DRIFT - leave * DRIFT;
          el.style.opacity = String(o);
          el.style.transform = `translate3d(0,${y}px,0)`;
          el.style.pointerEvents = o > 0.6 ? "auto" : "none";
          const hidden = o < 0.05;                   // a11y: only touch the DOM when this changes
          if (hidden !== lastHidden[i]) {
            lastHidden[i] = hidden;
            el.toggleAttribute("aria-hidden", hidden);
            el.querySelectorAll("a").forEach((a) => (a.tabIndex = hidden ? -1 : 0));
          }
        });
      }

      function frame() {
        if (ready && duration) {
          const gap = seekTo - seekAt;
          if (Math.abs(gap) > 0.0008) {
            seekAt += gap * 0.115;                     // easing factor: do not change
            if (clip!.readyState >= 2 && !clip!.seeking) { try { clip!.currentTime = seekAt; } catch {} }
          }
        }
        paint();
        if (running) raf = requestAnimationFrame(frame);
      }

      function setProgress(f: number) {
        if (!ready) meter!.style.transform = `scaleX(${f})`;
      }

      function start() {
        if (ready) return;
        ready = true;
        graph!.classList.add(s.ready);
      }

      function onMeta() {
        duration = clip!.duration || 0;
        clip!.pause();
        readScroll();
        seekAt = seekTo;
        try { clip!.currentTime = seekAt; } catch {}
      }

      function onError() {
        // The blob failed earlier and the network URL failed too: give up on the scrub.
        if (fellBack) { teardown(); teardown = () => {}; enterStatic(); return; }
        start();
      }

      function attach(src: string) {
        if (attached) return;
        attached = true;
        clip!.addEventListener("loadedmetadata", onMeta);
        clip!.addEventListener("loadeddata", start);
        clip!.addEventListener("canplaythrough", start);
        clip!.addEventListener("error", onError);
        clip!.src = src;
        clip!.load();
        timers.push(window.setTimeout(start, 12000));
      }

      // Seeking inside a fully buffered blob is near-instant, while range requests over
      // the network turn the scrub into a slideshow. So download the whole clip first.
      async function preload() {
        const bail = window.setTimeout(() => abort.abort(), 15000);
        timers.push(bail);
        try {
          const res = await fetch(video.url, { signal: abort.signal });
          if (!res.ok || !res.body) throw new Error(`hero video: ${res.status}`);
          const total = Number(res.headers.get("content-length")) || 0;
          const reader = res.body.getReader();
          const chunks: Uint8Array[] = [];
          let got = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            got += value.length;
            setProgress(total ? got / total : Math.min(got / 4e6, 0.95));
          }
          clearTimeout(bail);
          if (disposed) return;
          blobUrl = URL.createObjectURL(new Blob(chunks as BlobPart[], { type: video.type }));
          attach(blobUrl);
        } catch {
          clearTimeout(bail);
          if (disposed) return;
          fellBack = true;
          attach(video.url);
        }
      }

      // iOS won't paint a frame from a video that has never played, so nudge it with
      // play() + pause() on the first user gesture.
      const unlockEvents = ["touchstart", "pointerdown", "wheel", "keydown"] as const;
      function unlock() {
        if (!attached) return;
        unlockEvents.forEach((e) => window.removeEventListener(e, unlock));
        clip!.play().then(() => clip!.pause()).catch(() => {});
      }
      unlockEvents.forEach((e) => window.addEventListener(e, unlock, { passive: true }));

      const observer = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting && !running) {
          running = true;
          readScroll();
          raf = requestAnimationFrame(frame);
        } else if (!entry.isIntersecting && running) {
          running = false;
          cancelAnimationFrame(raf);
        }
      });
      observer.observe(section!);

      window.addEventListener("scroll", readScroll, { passive: true });
      window.addEventListener("resize", readScroll, { passive: true });
      readScroll();
      paint();

      // Start the download only after the page has loaded, so it never competes with first paint.
      let idleId = 0;
      const kickoff = () => {
        if (typeof window.requestIdleCallback === "function") idleId = window.requestIdleCallback(() => void preload(), { timeout: 2000 });
        else timers.push(window.setTimeout(() => void preload(), 300));
      };
      if (document.readyState === "complete") kickoff();
      else window.addEventListener("load", kickoff, { once: true });

      return () => {
        disposed = true;
        running = false;
        cancelAnimationFrame(raf);
        observer.disconnect();
        abort.abort();
        timers.forEach((t) => clearTimeout(t));
        if (idleId) window.cancelIdleCallback(idleId);
        window.removeEventListener("load", kickoff);
        window.removeEventListener("scroll", readScroll);
        window.removeEventListener("resize", readScroll);
        unlockEvents.forEach((e) => window.removeEventListener(e, unlock));
        clip!.removeEventListener("loadedmetadata", onMeta);
        clip!.removeEventListener("loadeddata", start);
        clip!.removeEventListener("canplaythrough", start);
        clip!.removeEventListener("error", onError);
        clip!.removeAttribute("src");
        clip!.load();
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        graph!.classList.remove(s.ready);
      };
    }

    function apply() {
      teardown();
      teardown = () => {};
      if (staticMq.matches || nav.connection?.saveData === true) enterStatic();
      else teardown = setupScrub();
    }

    apply();
    staticMq.addEventListener("change", apply);
    return () => {
      staticMq.removeEventListener("change", apply);
      teardown();
    };
  }, []);

  return (
    <section ref={sectionRef} className={s.hero} aria-label="Hive introduction">
      <div className={s.stage}>
        <Waves />
        <i ref={meterRef} className={s.meter} aria-hidden="true" />
        <div className={s.column}>
          <div ref={graphRef} className={s.graph} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element -- poster must paint before any JS, identical to frame 0 */}
            <img src="/hero/poster-start.webp" alt="" className={s.poster} width={1400} height={452} fetchPriority="high" />
            <video ref={clipRef} muted playsInline preload="none" disablePictureInPicture tabIndex={-1} />
          </div>
          {PANELS.map((p, i) => (
            <article
              key={i}
              data-panel
              className={cn(s.panel, i === 0 && s.first)}
              aria-hidden={i === 0 ? undefined : true}
              ref={(el) => { panelRefs.current[i] = el; }}
            >
              <div className={s.top}>
                <p className={s.eyebrow}>{p.eyebrow}</p>
                {i === 0 ? <h1 className={s.h1}>{p.title}</h1> : <h2 className={s.h1}>{p.title}</h2>}
                <p className={s.lead}>{p.lead}</p>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element -- static-mode still, hidden in scrub mode */}
              <img className={s.still} src={`/hero/still-p${i + 1}.webp`} alt={p.stillAlt} width={1400} height={452} loading="lazy" />
              <div className={s.cta}>
                {p.cta && <PillLink href="/login" tabIndex={i === 0 ? undefined : -1}>{p.cta}</PillLink>}
              </div>
            </article>
          ))}
        </div>
        <p className={s.baseline}>Claude · GPT · Therapy Bot — one graph, your permissions</p>
      </div>
    </section>
  );
}
