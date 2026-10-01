// Renders the hero graph animation to PNG frames.
// Usage: node render.mjs   → frames/0000.png … frames/0240.png (1400×452)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const FRAMES = 241;                       // 10 s at 24 fps, frames 0..240
const out = path.resolve("frames");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 700, height: 226 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(path.resolve("render.html")).href);
await page.evaluate(() => document.fonts.ready);
await page.waitForFunction(() => [...document.images].every(i => i.complete));

for (let f = 0; f < FRAMES; f++) {
  await page.evaluate(t => window.render(t), f / (FRAMES - 1));
  await page.screenshot({ path: `${out}/${String(f).padStart(4, "0")}.png`, clip: { x: 0, y: 0, width: 700, height: 226 } });
}
await browser.close();
console.log(`rendered ${FRAMES} frames → ${out}`);
