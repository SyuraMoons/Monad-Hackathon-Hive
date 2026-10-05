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
