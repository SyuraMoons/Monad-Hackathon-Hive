// Topic colours are design tokens (design.md §3.3), not a list of allowed topics: any topic an edge
// carries gets drawn, and topics without their own token use ink-2.
const TOKENS: Record<string, string> = {
  work: "var(--color-topic-work)",
  research: "var(--color-topic-research)",
  personal: "var(--color-topic-personal)",
};

export const topicColor = (topic: string) => TOKENS[topic] ?? "var(--color-ink-2)";

/** "expires 30d" · "expires 5h" · "expires 12m" · "expired" */
export function expiresIn(expiresAt: number, now = Math.floor(Date.now() / 1000)): string {
  const s = expiresAt - now;
  if (s <= 0) return "expired";
  if (s >= 86_400) return `expires ${Math.round(s / 86_400)}d`;
  if (s >= 3_600) return `expires ${Math.round(s / 3_600)}h`;
  return `expires ${Math.max(1, Math.round(s / 60))}m`;
}
