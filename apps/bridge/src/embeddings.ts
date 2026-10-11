import { decryptBytesWithAny, encryptBytes } from "@hive/crypto";
import type { Hex, MemoryDoc } from "@hive/shared";
import type { Opened, ReadDeps } from "./memory.js";
import { readKeys, type DocCache } from "./sessions.js";
import type { Embedder, VectorStore } from "./types.js";

// Embedding vectors for search (ADR-022). A vector is derived from plaintext and can be partly turned back into it, so it is
// handled like plaintext: computed in the bridge, encrypted with the owner's key before it is stored, and never logged.

/** What the bridge needs to embed for one session. `owner` and `keyId` are the session's, like on a write. */
export type EmbeddingDeps = {
  embedder: Embedder;
  vectors: VectorStore;
  owner: Hex;
  keyId: string;
  /**
   * Cosine similarity under which a vector match is ignored. e5 scores are compressed: measured on multilingual-e5-small,
   * right matches 0.80-0.875 and wrong ones 0.72-0.81. The floor only cuts the clearly unrelated; ranking does the rest.
   */
  minSimilarity: number;
};

/** Vectors computed inside a search call. The rest finish in the background, so a first search never waits for all of them. */
export const BACKFILL_SYNC = 20;
const BACKFILL_BATCH = 16;
/** The model reads about 512 tokens; more text only costs time. */
const TEXT_MAX_CHARS = 2000;

/** The gist says what a memory is about, so it goes first and makes the vector cleaner. */
export const embeddingText = (doc: MemoryDoc) => `${doc.gist ? `${doc.gist}\n` : ""}${doc.content}`.slice(0, TEXT_MAX_CHARS);

export function vectorToBytes(v: Float32Array): Uint8Array {
  const out = new Uint8Array(v.length * 4);
  const view = new DataView(out.buffer);
  v.forEach((x, i) => view.setFloat32(i * 4, x, true));
  return out;
}

export function vectorFromBytes(bytes: Uint8Array, dims: number): Float32Array {
  if (bytes.byteLength !== dims * 4) throw new Error("vector has the wrong size");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Float32Array.from({ length: dims }, (_, i) => view.getFloat32(i * 4, true));
}

/** Cosine similarity of two unit vectors. */
export function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
}

const ready = (e?: EmbeddingDeps): e is EmbeddingDeps => e !== undefined && e.embedder.status() === "ready";

type Report = (stage: string, error: unknown) => void;

async function seal(e: EmbeddingDeps, key: Hex, hash: Hex, vector: Float32Array): Promise<void> {
  const sealed = await encryptBytes(vectorToBytes(vector), key);
  await e.vectors.putVector(hash, e.embedder.model, e.embedder.dims, { ciphertext: sealed.ciphertext, iv: sealed.iv, owner: e.owner, keyId: e.keyId });
}

type Job = { hash: Hex; doc: MemoryDoc };

/** Embeds and stores a batch. A failed store still leaves the vector in the session cache, so this session can use it. */
async function embedBatch(e: EmbeddingDeps, key: Hex, docs: DocCache | undefined, jobs: Job[], onError?: Report): Promise<Float32Array[]> {
  if (jobs.length === 0) return [];
  const vectors = await e.embedder.embedPassages(jobs.map((j) => embeddingText(j.doc)));
  // A session that ended while the model ran must not store anything more under its key.
  if (docs?.isClosed) return vectors;
  await Promise.all(
    jobs.map(async (job, i) => {
      const v = vectors[i]!;
      docs?.setVector(job.hash, e.embedder.model, v);
      try {
        await seal(e, key, job.hash, v);
      } catch (err) {
        onError?.("embed", err);
      }
    }),
  );
  return vectors;
}

// Memories still to embed, per session cache. The entry goes away with the session, and the loop ends when the queue is
// empty or the session is closed: a closed session's key and plaintext are not kept alive by background work.
const queues = new WeakMap<DocCache, { pending: Map<string, Job>; running: boolean }>();

function enqueue(e: EmbeddingDeps, key: Hex, docs: DocCache, jobs: Job[], onError?: Report): void {
  if (docs.isClosed) return;
  let q = queues.get(docs);
  if (!q) queues.set(docs, (q = { pending: new Map(), running: false }));
  for (const j of jobs) q.pending.set(j.hash.toLowerCase(), j);
  if (q.running) return;
  q.running = true;
  const queue = q;
  void (async () => {
    try {
      while (queue.pending.size > 0 && !docs.isClosed) {
        const batch = [...queue.pending.values()].slice(0, BACKFILL_BATCH);
        for (const j of batch) queue.pending.delete(j.hash.toLowerCase());
        await embedBatch(e, key, docs, batch.filter((j) => !docs.getVector(j.hash, e.embedder.model)), onError);
      }
    } catch (err) {
      queue.pending.clear();
      onError?.("embed", err);
    } finally {
      if (docs.isClosed) queue.pending.clear();
      queue.running = false;
    }
  })();
}

/** How many memories of this session are still waiting for a vector. */
export const backfillPending = (docs: DocCache | undefined) => queues.get(docs!)?.pending.size ?? 0;

export async function queryVector(deps: ReadDeps, query: string): Promise<Float32Array | undefined> {
  if (!ready(deps.embeddings)) return undefined;
  try {
    return await deps.embeddings.embedder.embedQuery(query);
  } catch (e) {
    deps.onError?.("embed", e);
    return undefined;
  }
}

/**
 * The vectors of these memories, newest first: the session cache, then the encrypted store, then the model.
 * At most BACKFILL_SYNC are computed here; the rest are queued. A failure at any step leaves that memory without a vector,
 * and it ranks on its words alone.
 */
export async function vectorsFor(deps: ReadDeps, items: readonly Opened[]): Promise<{ vectors: Map<string, Float32Array>; pending: number }> {
  const e = deps.embeddings;
  const vectors = new Map<string, Float32Array>();
  if (!ready(e)) return { vectors, pending: 0 };
  const model = e.embedder.model;
  const missing = new Map<string, Job>();
  for (const { slot, doc } of items) {
    const key = slot.contentHash.toLowerCase();
    if (vectors.has(key) || missing.has(key)) continue;
    const hit = deps.docs?.getVector(key, model);
    if (hit) vectors.set(key, hit);
    else missing.set(key, { hash: slot.contentHash, doc });
  }
  if (missing.size > 0) {
    try {
      const stored = await e.vectors.getVectors([...missing.values()].map((j) => j.hash), model);
      await Promise.all(
        [...missing].map(async ([key, job]) => {
          const row = stored.get(key);
          if (!row) return;
          try {
            const v = vectorFromBytes(await decryptBytesWithAny(row, readKeys(deps)), e.embedder.dims);
            vectors.set(key, v);
            deps.docs?.setVector(job.hash, model, v);
            missing.delete(key);
          } catch (err) {
            deps.onError?.("embed", err);
          }
        }),
      );
    } catch (err) {
      deps.onError?.("embed", err);
    }
  }
  if (missing.size > 0) {
    const jobs = [...missing.values()];
    const now = jobs.slice(0, BACKFILL_SYNC);
    try {
      const made = await embedBatch(e, deps.encryptionKey, deps.docs, now, deps.onError);
      now.forEach((j, i) => {
        vectors.set(j.hash.toLowerCase(), made[i]!);
        missing.delete(j.hash.toLowerCase());
      });
    } catch (err) {
      deps.onError?.("embed", err);
    }
    const rest = jobs.slice(BACKFILL_SYNC);
    if (rest.length > 0 && deps.docs) enqueue(e, deps.encryptionKey, deps.docs, rest, deps.onError);
  }
  return { vectors, pending: missing.size };
}

/** After a write: embed the new memory without making the writer wait. Failures are reported by stage only. */
export function embedAfterWrite(e: EmbeddingDeps | undefined, key: Hex, docs: DocCache | undefined, hash: Hex, doc: MemoryDoc, onError?: Report): void {
  if (!ready(e)) return;
  void embedBatch(e, key, docs, [{ hash, doc }], onError).catch((err) => onError?.("embed", err));
}
