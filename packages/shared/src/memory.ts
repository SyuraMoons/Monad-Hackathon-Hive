import { z } from "zod";
import { zSlotId } from "./ids.js";

// The plaintext that gets encrypted (ADR-022). Nothing here touches the chain: the contract keeps only the hash.
// Text without the prefix is legacy content from before this format, and reads back as `{ content }`.

export const MEMORY_ENVELOPE_PREFIX = "hive-memory/v1\n";

export const MAX_CONTENT_BYTES = 4096;
export const GIST_MAX_CHARS = 200;
export const ENTITIES_MAX = 10;
export const ENTITY_MAX_CHARS = 64;
export const MEMORY_KINDS = ["decision", "interface", "fact", "task", "session", "state"] as const;

const byteLength = (s: string) => new TextEncoder().encode(s).length;
const charLength = (s: string) => [...s].length;

export const zMemoryContent = z.string().min(1).refine((s) => byteLength(s) <= MAX_CONTENT_BYTES, `content must be at most ${MAX_CONTENT_BYTES} bytes`);
export const zGist = z.string().trim().min(1).refine((s) => charLength(s) <= GIST_MAX_CHARS && !s.includes("\n"), `gist must be one line of at most ${GIST_MAX_CHARS} characters`);
export const zMemoryKind = z.enum(MEMORY_KINDS);
export const zEntity = z.string().trim().min(1).refine((s) => charLength(s) <= ENTITY_MAX_CHARS, `an entity must be at most ${ENTITY_MAX_CHARS} characters`);
export const zEntities = z.array(zEntity).max(ENTITIES_MAX);

/** What an agent may add to a memory next to its content. */
export const zMemoryMeta = z.object({
  gist: zGist.optional(),
  kind: zMemoryKind.optional(),
  entities: zEntities.optional(),
  /** A slot id of the same sender and topic that this memory replaces. */
  supersedes: zSlotId.optional(),
});

export const zMemoryDoc = zMemoryMeta.extend({ content: zMemoryContent });

export type MemoryKind = (typeof MEMORY_KINDS)[number];
export type MemoryMeta = z.output<typeof zMemoryMeta>;
export type MemoryDoc = { content: string; gist?: string; kind?: MemoryKind; entities?: string[]; supersedes?: bigint };

/**
 * The text to encrypt. A memory with no metadata is sealed as it is, so it stays readable by older bridges, unless the
 * content itself starts with the envelope prefix: then it is wrapped, so text an agent wrote can never read back as metadata.
 */
export function sealDoc(doc: { content: string; gist?: string; kind?: MemoryKind; entities?: readonly string[]; supersedes?: string | bigint }): string {
  const { content, gist, kind, entities, supersedes } = doc;
  if (gist === undefined && kind === undefined && !entities?.length && supersedes === undefined && !content.startsWith(MEMORY_ENVELOPE_PREFIX)) return content;
  const body: Record<string, unknown> = { content };
  if (gist !== undefined) body.gist = gist;
  if (kind !== undefined) body.kind = kind;
  if (entities?.length) body.entities = entities;
  if (supersedes !== undefined) body.supersedes = String(supersedes);
  return MEMORY_ENVELOPE_PREFIX + JSON.stringify(body);
}

/** Never throws: anything that is not a valid envelope is legacy content, so an old memory is never lost. */
export function openDoc(plaintext: string): MemoryDoc {
  if (!plaintext.startsWith(MEMORY_ENVELOPE_PREFIX)) return { content: plaintext };
  let raw: unknown;
  try {
    raw = JSON.parse(plaintext.slice(MEMORY_ENVELOPE_PREFIX.length));
  } catch {
    return { content: plaintext };
  }
  const parsed = zMemoryDoc.safeParse(raw);
  if (!parsed.success) return { content: plaintext };
  const { content, gist, kind, entities, supersedes } = parsed.data;
  const doc: MemoryDoc = { content };
  if (gist !== undefined) doc.gist = gist;
  if (kind !== undefined) doc.kind = kind;
  if (entities?.length) doc.entities = entities;
  if (supersedes !== undefined) doc.supersedes = supersedes;
  return doc;
}
