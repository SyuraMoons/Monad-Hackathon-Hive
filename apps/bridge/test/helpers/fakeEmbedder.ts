import { tokenize } from "../../src/search.js";
import type { Embedder, EmbedderStatus } from "../../src/types.js";

/**
 * A deterministic embedder for tests. Each word hashes to one of `dims` buckets, and words in the same `group` share a
 * bucket, so "release" and "deploy" are close the way a real model would put them. Vectors are unit length.
 */
export class FakeEmbedder implements Embedder {
  readonly dims = 64;
  state: EmbedderStatus = "ready";
  passageCalls: string[][] = [];
  queryCalls: string[] = [];
  failQuery = false;
  failPassages = false;
  private bucket = new Map<string, number>();

  constructor(
    readonly model = "fake-e5",
    groups: string[][] = [],
  ) {
    groups.forEach((g, i) => g.forEach((w) => this.bucket.set(w, i)));
  }

  status() {
    return this.state;
  }

  private vec(text: string): Float32Array {
    const v = new Float32Array(this.dims);
    for (const t of tokenize(text)) {
      let b = this.bucket.get(t);
      if (b === undefined) {
        b = 32 + [...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 32, 7);
      }
      v[b] = (v[b] ?? 0) + 1;
    }
    const norm = Math.hypot(...v) || 1;
    return v.map((x) => x / norm);
  }

  async embedQuery(text: string) {
    this.queryCalls.push(text);
    if (this.failQuery) throw new Error(`boom: ${text}`);
    return this.vec(text);
  }

  async embedPassages(texts: string[]) {
    this.passageCalls.push(texts);
    if (this.failPassages) throw new Error(`boom: ${texts.join("|")}`);
    return texts.map((t) => this.vec(t));
  }

  get passagesEmbedded() {
    return this.passageCalls.flat().length;
  }
}
