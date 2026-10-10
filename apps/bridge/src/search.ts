import { MEMORY_NOTICE, SEARCH_LIMIT_DEFAULT, type MemoryDoc, type SearchMemoryOutput } from "@hive/shared";
import { bytesOf, memoryFields, previewOf, senderNames, visibleMemories, type Opened, type ReadDeps, type Scope } from "./memory.js";

// Search ranks inside the bridge, after the permission filter, over memories it already decrypted for this reader (ADR-022).
// Nothing here is stored, and nothing in a log or an error carries a query or a memory.

const K1 = 1.2;
const B = 0.75;
/** A gist and an entity say more about a memory than a line of its text. */
const GIST_WEIGHT = 2;
const ENTITY_WEIGHT = 2;
/** A word that only shares a prefix with another counts for half (deploy / deployment). */
const PREFIX_WEIGHT = 0.5;
const PREFIX_MIN = 4;
/** Added when a query contains an entity of the memory as a whole. Entities are exact handles: names, ids, addresses. */
const ENTITY_BOOST = 3;
/** Newer memories win a close call. Gentle: a day-old match never beats a much better old one. */
const RECENCY_WEIGHT = 0.15;
const RECENCY_HALF_LIFE_S = 14 * 24 * 3600;

const STOP = new Set(
  [
    // English
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "is", "are", "was", "were", "be", "it", "this", "that", "with", "as", "at", "by", "from",
    // Indonesian
    "yang", "dan", "di", "ke", "dari", "untuk", "dengan", "ini", "itu", "adalah", "pada", "atau", "juga", "ada", "akan", "sudah", "belum", "saya", "kami", "kita",
  ],
);

/** Lower-case letters and digits, any script. Short words and stop words are dropped, a bare digit run is kept. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const m of text.toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)) {
    const t = m[0];
    if (STOP.has(t)) continue;
    if (t.length < 2 && !/\p{N}/u.test(t)) continue;
    out.push(t);
  }
  return out;
}

const normEntity = (e: string) => tokenize(e).join(" ");

export type Lexical = { score: number; text: boolean; entity: boolean };

type Doc = { terms: Map<string, number>; length: number; entities: string[] };

function indexDoc(doc: MemoryDoc): Doc {
  const terms = new Map<string, number>();
  let length = 0;
  const add = (tokens: string[], weight: number) => {
    for (const t of tokens) {
      terms.set(t, (terms.get(t) ?? 0) + weight);
      length += weight;
    }
  };
  add(tokenize(doc.content), 1);
  if (doc.gist) add(tokenize(doc.gist), GIST_WEIGHT);
  for (const e of doc.entities ?? []) add(tokenize(e), ENTITY_WEIGHT);
  return { terms, length, entities: (doc.entities ?? []).map(normEntity).filter(Boolean) };
}

/** How often a query word is in a document: exact hits in full, prefix relatives at half. */
function frequency(doc: Doc, word: string): number {
  let tf = doc.terms.get(word) ?? 0;
  if (word.length >= PREFIX_MIN) {
    for (const [term, n] of doc.terms) {
      if (term === word || term.length < PREFIX_MIN) continue;
      if (term.startsWith(word) || word.startsWith(term)) tf += PREFIX_WEIGHT * n;
    }
  }
  return tf;
}

/** True when the query holds the entity's words in a row. */
function mentions(queryTokens: string[], entity: string): boolean {
  const words = entity.split(" ");
  for (let i = 0; i + words.length <= queryTokens.length; i++) if (words.every((w, j) => queryTokens[i + j] === w)) return true;
  return false;
}

/**
 * BM25 over the gist, entities and text of every candidate, plus an exact-entity boost. The corpus is the candidate set,
 * so a word every memory shares counts for little. A memory with no match scores 0 and is not returned.
 */
export function lexicalScores(query: string, docs: readonly MemoryDoc[]): Lexical[] {
  const q = tokenize(query);
  const queryWords = [...new Set(q)];
  const indexed = docs.map(indexDoc);
  const n = indexed.length;
  const avg = indexed.reduce((sum, d) => sum + d.length, 0) / Math.max(n, 1) || 1;
  const df = new Map<string, number>();
  for (const word of queryWords) df.set(word, indexed.filter((d) => frequency(d, word) > 0).length);
  return indexed.map((d) => {
    let score = 0;
    for (const word of queryWords) {
      const tf = frequency(d, word);
      if (tf === 0) continue;
      const idf = Math.log(1 + (n - df.get(word)! + 0.5) / (df.get(word)! + 0.5));
      score += (idf * tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * d.length) / avg));
    }
    const text = score > 0;
    const entity = d.entities.some((e) => mentions(q, e));
    if (entity) score += ENTITY_BOOST;
    return { score, text, entity };
  });
}

const recency = (ageSeconds: number) => 1 + RECENCY_WEIGHT * 2 ** (-Math.max(ageSeconds, 0) / RECENCY_HALF_LIFE_S);

export type SearchArgs = Omit<Scope, "slotIds" | "cursor" | "limit"> & { query: string; limit?: number };

/** `hive_search_memory`: the permitted, visible memories ranked against the query. Previews only, like a list. */
export async function searchMemory(deps: ReadDeps, args: SearchArgs): Promise<SearchMemoryOutput> {
  const none: SearchMemoryOutput = { memories: [], mode: "lexical" };
  try {
    const found = await visibleMemories(deps, args, Infinity);
    if (found.length === 0) return none;
    const names = await senderNames(deps, found.map((o) => o.slot));
    const readable = found.filter((o) => names.has(o.slot.agentId));
    const now = Number(deps.now());
    const scored = lexicalScores(args.query, readable.map((o) => o.doc))
      .map((s, i) => ({ ...s, item: readable[i]! as Opened }))
      .filter((s) => s.score > 0)
      .map((s) => ({ ...s, final: s.score * recency(now - Number(s.item.slot.writtenAt)) }))
      .sort((a, b) => b.final - a.final || Number(b.item.slot.id - a.item.slot.id))
      .slice(0, args.limit ?? SEARCH_LIMIT_DEFAULT);
    const memories = scored.map(({ item, final, text, entity }) => ({
      ...memoryFields(item.slot, names.get(item.slot.agentId)!, item.doc),
      bytes: bytesOf(item.doc.content),
      preview: previewOf(item.doc.content),
      score: Math.round(final * 1000) / 1000,
      matched: [...(text ? (["text"] as const) : []), ...(entity ? (["entity"] as const) : [])],
    }));
    return { memories, mode: "lexical", ...(memories.length && { notice: MEMORY_NOTICE }) };
  } catch (e) {
    deps.onError?.("permission-check", e);
    return none;
  }
}
