// Display formats from design.md §9.

/** `0x4f1c…9a2e`: 0x plus 4 characters … last 4. */
export const shortHash = (hash: string) => (hash.length > 12 ? `${hash.slice(0, 6)}…${hash.slice(-4)}` : hash);

/** `#1 · 0x9c…4e1a` */
export const agentLabel = (agentId: bigint, agentKey: string) => {
  const k = agentKey.toLowerCase();
  return `#${agentId} · ${k.slice(0, 4)}…${k.slice(-4)}`;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `27 Oct 2026` in the viewer's local time. Months are always 3 letters (en-GB now prints "Sept"). */
export const longDate = (unixSeconds: number) => {
  const d = new Date(unixSeconds * 1000);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

/** 24-hour `18:02:41` in the viewer's local time. */
export const clockTime = (unixSeconds: number) =>
  new Date(unixSeconds * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
