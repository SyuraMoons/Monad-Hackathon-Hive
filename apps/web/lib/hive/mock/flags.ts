// Failure switches for development, comma-separated: /login?mock=reject · /canvas?mock=tx-fail,bridge-offline
export type MockFlag = "reject" | "prf-unavailable" | "tx-fail" | "bridge-offline" | "no-agents";

export function mockFlag(flag: MockFlag): boolean {
  if (typeof window === "undefined") return false;
  const value = new URLSearchParams(window.location.search).get("mock") ?? "";
  return value.split(",").map((s) => s.trim()).includes(flag);
}

/** 300–1200 ms, like a real network round trip. */
export const latency = () => new Promise<void>((r) => setTimeout(r, 300 + Math.random() * 900));

export const randomHex32 = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return "0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};
