// Where an edge and its label sit when the pair A → B and B → A both exist. Pure, so the canvas layers share one answer.

export type Pt = { x: number; y: number };

/** Each arrow of a pair sits this far from the line between the nodes, so the two are 2 × PAIR_SHIFT apart. */
export const PAIR_SHIFT = 7;
// Rough size of an edge label (topic · expiry, and the tx line), used to keep the two labels of a pair apart.
const LABEL_HALF_W = 85;
const LABEL_HALF_H = 28;
const LABEL_GAP = 8;

/** True when a live edge runs the other way between the same two agents. A revoked ghost never counts. */
export function hasReverse(edges: Iterable<{ from: bigint; to: bigint; state: string }>, edge: { from: bigint; to: bigint }): boolean {
  for (const e of edges) if (e.from === edge.to && e.to === edge.from && e.state !== "revoked") return true;
  return false;
}

/** Unit normal to a → b. Edges A → B and B → A get opposite normals, which is what pulls a pair apart. */
export function normal(a: Pt, b: Pt): Pt {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
}

/** How far the line moves sideways: nothing for a lone edge. */
export function lineShift(a: Pt, b: Pt, pair: boolean): Pt {
  if (!pair) return { x: 0, y: 0 };
  const n = normal(a, b);
  return { x: n.x * PAIR_SHIFT, y: n.y * PAIR_SHIFT };
}

/**
 * CSS transform for an edge label (or its keyboard focus box) relative to the midpoint of the line.
 * A lone edge keeps its label hanging `below` px under the midpoint. A pair centres each label on its own side,
 * far enough out along the normal that the two boxes never overlap, whatever the angle.
 */
export function labelTransform(a: Pt, b: Pt, pair: boolean, below: number): string {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  if (!pair) return `translate(-50%, 0) translate(${mid.x}px, ${mid.y + below}px)`;
  const n = normal(a, b);
  const d = LABEL_HALF_W * Math.abs(n.x) + LABEL_HALF_H * Math.abs(n.y) + PAIR_SHIFT + LABEL_GAP;
  return `translate(-50%, -50%) translate(${mid.x + n.x * d}px, ${mid.y + n.y * d}px)`;
}
