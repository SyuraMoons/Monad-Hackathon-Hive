// Renders the hero scene to PNG frames.
// Usage: node render.mjs   → frames/0000.png … frames/0240.png (1920×1080)
//                            frames/still-p1.png … still-p3.png (graph only, 2×, for static mode)
// PLAYWRIGHT_MODULE / PLAYWRIGHT_CHANNEL let you point at playwright-core and an installed Chrome.
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");

const FRAMES = 241;                       // 10 s at 24 fps, frames 0..240
const STILLS = [0, 130, 178];             // one per text panel; the last is mid-pulse
const STILL_CLIP = { x: 520, y: 500, width: 880, height: 370 };
const out = path.resolve("frames");
mkdirSync(out, { recursive: true });

const scene = pathToFileURL(path.resolve("render.html")).href;
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL });

async function open(url, deviceScaleFactor) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor });
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every(i => i.complete));
  return page;
}

const page = await open(scene, 1);
for (let f = 0; f < FRAMES; f++) {
  await page.evaluate(t => window.render(t), f / (FRAMES - 1));
  await page.screenshot({ path: `${out}/${String(f).padStart(4, "0")}.png` });
}

const bare = await open(`${scene}?bare=1`, 2);
for (const [i, f] of STILLS.entries()) {
  await bare.evaluate(t => window.render(t), f / (FRAMES - 1));
  await bare.screenshot({ path: `${out}/still-p${i + 1}.png`, clip: STILL_CLIP });
}

await browser.close();
console.log(`rendered ${FRAMES} frames and ${STILLS.length} stills → ${out}`);
