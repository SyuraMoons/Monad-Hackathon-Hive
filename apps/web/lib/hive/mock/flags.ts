// Failure switches for development, comma-separated: /canvas?mock=tx-fail,bridge-offline. Passkeys are always real.
export type MockFlag = "tx-fail" | "bridge-offline" | "no-agents" | "stress" | "low-balance";

const urlFlags = () =>
  typeof window === "undefined" ? [] : (new URLSearchParams(window.location.search).get("mock") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

// Flags from the page that first loaded the mock stick for the tab, so /login?mock=tx-fail still applies on /canvas.
const initialFlags = urlFlags();

export function mockFlag(flag: MockFlag): boolean {
  return initialFlags.includes(flag) || urlFlags().includes(flag);
}

/** 300–1200 ms, like a real network round trip. */
export const latency = () => new Promise<void>((r) => setTimeout(r, 300 + Math.random() * 900));

export const randomHex32 = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return "0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

// Like the flags: a number from the first page load sticks for the tab, so /login?agents=8 still applies on /canvas.
const initialSearch = typeof window === "undefined" ? "" : window.location.search;

/** ?agents=8 / ?pace=1200 for the stress scene: a number from the page URL, clamped, or the default. */
export function urlNumber(name: string, fallback: number, min: number, max: number): number {
  const n = Number(new URLSearchParams(window.location.search).get(name) ?? new URLSearchParams(initialSearch).get(name));
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}
