import { decrypt, encrypt } from "@hive/crypto";
import { HiveError, MEMORY_NOTICE, MEMORY_PAGE_DEFAULT, PREVIEW_CHARS, openDoc, sealDoc, zTxHash, type Hex, type ListMemoryOutput, type MemoryDoc, type MemoryKind, type MemoryMeta, type ReadMemoryOutput, type WriteMemoryOutput } from "@hive/shared";
import { concatBytes, hexToBytes, keccak256, stringToBytes } from "viem";
import { ownSlots, permittedSlots } from "./permissions.js";
import type { DocCache } from "./sessions.js";
import type { ChainReader, ChainSlot, ChainWriter, CiphertextStore } from "./types.js";

export type ReadDeps = {
  chain: ChainReader;
  store: CiphertextStore;
  /** The owner's delegated encryption key for this agent's session. */
  encryptionKey: Hex;
  now: () => bigint;
  /** The session's decrypted memories. Optional: without it every call fetches and decrypts again. */
  docs?: DocCache;
  /** Reports a failure without any memory content. */
  onError?: (stage: string, error: unknown) => void;
};

/** At most this many of the newest permitted slots are looked at per call (ADR-022). */
export const CANDIDATES_MAX = 500;
/** Slots opened per round trip while walking newest to oldest. */
const PAGE = 60;

export type Scope = {
  agentId: bigint;
  since?: number;
  topic?: string;
  kind?: MemoryKind;
  /** The caller's own slots instead of the ones shared with it. */
  mine?: boolean;
  /** `<writtenAt>:<slotId>` of the newest slot the caller has seen. */
  cursor?: string;
  includeSuperseded?: boolean;
  slotIds?: bigint[];
  limit?: number;
};

/** A slot that passed the permission check and was opened. */
export type Opened = { slot: ChainSlot; doc: MemoryDoc };

const newestFirst = (a: ChainSlot, b: ChainSlot) => Number(b.writtenAt - a.writtenAt) || Number(b.id - a.id);

/**
 * incoming edges -> slots since `since` from each sender -> permission filter -> cursor and `slotIds` filters -> newest first.
 * `mine` skips the edges and takes the caller's own slots. `slotIds` only narrows the permitted set: an id the
 * reader has no edge for is dropped, never fetched.
 * With a cursor the window is the OLDEST slots after it, so a backlog bigger than the window drains over several calls;
 * `truncated` then says newer slots remain outside it.
 */
async function candidates(deps: ReadDeps, args: Scope): Promise<{ slots: ChainSlot[]; truncated: boolean }> {
  const cursor = args.cursor ? args.cursor.split(":").map((n) => BigInt(n)) : undefined;
  const since = BigInt(Math.max(args.since ?? 0, Number(cursor?.[0] ?? 0n)));
  let allowed: ChainSlot[];
  if (args.mine) {
    allowed = ownSlots({ reader: args.agentId, slots: await deps.chain.slotsSince(args.agentId, since), topic: args.topic });
  } else {
    const now = deps.now();
    const edges = await deps.chain.edgesTo(args.agentId);
    const senders = [...new Set(edges.map((e) => e.from))].filter((id) => id !== args.agentId);
    const slots = (await Promise.all(senders.map((id) => deps.chain.slotsSince(id, since)))).flat();
    allowed = permittedSlots({ reader: args.agentId, edges, slots, now, topic: args.topic });
  }
  if (cursor) allowed = allowed.filter((s) => s.writtenAt > cursor[0]! || (s.writtenAt === cursor[0] && s.id > cursor[1]!));
  if (args.slotIds) {
    const wanted = new Set(args.slotIds);
    allowed = allowed.filter((s) => wanted.has(s.id));
  }
  allowed.sort(newestFirst);
  if (cursor) return { slots: allowed.slice(-CANDIDATES_MAX), truncated: allowed.length > CANDIDATES_MAX };
  return { slots: allowed.slice(0, CANDIDATES_MAX), truncated: false };
}

/**
 * The visible memories, newest first, opened a page at a time until `stop` are found.
 * A slot is hidden when a newer slot of the same sender and topic supersedes it, or when it is an older `state` slot
 * of its sender and topic. Walking newest to oldest means everything that could hide a slot was already seen.
 * Naming slots outright with `slotIds`, or `includeSuperseded`, shows them all.
 * `incomplete` is set when a batch could not be fetched, so a caller that must not skip anything knows to retry.
 */
async function walk(deps: ReadDeps, args: Scope, stop: number) {
  const { slots: all, truncated } = await candidates(deps, args);
  const showAll = args.includeSuperseded === true || args.slotIds !== undefined;
  // "<sender>:<topic>:<slot>" of every slot a memory replaces. The key carries the claimant's own sender and topic, so a
  // claim on someone else's slot builds a key that never matches: it can neither hide that slot nor block the real claim.
  const replaced = new Set<string>();
  const stateSeen = new Set<string>();
  const out: Opened[] = [];
  let incomplete = false;
  for (let i = 0; i < all.length && out.length < stop; i += PAGE) {
    const page = all.slice(i, i + PAGE);
    const loaded = await loadDocs(deps, page);
    if (loaded.failed) incomplete = true;
    for (const slot of page) {
      const doc = loaded.docs.get(slot.contentHash.toLowerCase());
      if (!doc) continue;
      let hidden = replaced.has(`${slot.agentId}:${slot.topic}:${slot.id}`);
      if (doc.supersedes !== undefined) replaced.add(`${slot.agentId}:${slot.topic}:${doc.supersedes}`);
      if (doc.kind === "state") {
        const key = `${slot.agentId}:${slot.topic}`;
        if (stateSeen.has(key)) hidden = true;
        stateSeen.add(key);
      }
      if ((hidden && !showAll) || (args.kind && doc.kind !== args.kind)) continue;
      out.push({ slot, doc });
      if (out.length >= stop) break;
    }
  }
  return { found: out, truncated, incomplete, newest: all[0] };
}

export async function visibleMemories(deps: ReadDeps, args: Scope, stop: number): Promise<Opened[]> {
  return (await walk(deps, args, stop)).found;
}

/** Sender names, read once per sender. A sender whose lookup fails is left out, with the others kept. */
export async function senderNames(deps: ReadDeps, slots: readonly ChainSlot[]): Promise<Map<bigint, string>> {
  const names = new Map<bigint, string>();
  await Promise.all(
    [...new Set(slots.map((s) => s.agentId))].map(async (id) => {
      try {
        names.set(id, (await deps.chain.agent(id)).name);
      } catch (e) {
        deps.onError?.("memory", e);
      }
    }),
  );
  return names;
}

const cursorOf = (slot: ChainSlot) => `${slot.writtenAt}:${slot.id}`;

/** What read, list and search all say about a memory. Only the fields the agent set are present. */
export function memoryFields(slot: ChainSlot, name: string, doc: MemoryDoc) {
  return {
    slotId: slot.id,
    fromAgentId: slot.agentId,
    fromName: name,
    topic: slot.topic as ReadMemoryOutput["memories"][number]["topic"],
    writtenAt: Number(slot.writtenAt),
    ...(doc.gist !== undefined && { gist: doc.gist }),
    ...(doc.kind !== undefined && { kind: doc.kind }),
    ...(doc.entities && { entities: doc.entities }),
    ...(doc.supersedes !== undefined && { supersedes: doc.supersedes }),
  };
}

/** The newest `limit` visible memories, oldest first like a conversation, plus whether older ones were left out. */
async function newestPage(deps: ReadDeps, args: Scope) {
  const limit = args.limit ?? MEMORY_PAGE_DEFAULT;
  if (args.cursor) return forwardPage(deps, args, limit);
  const found = await visibleMemories(deps, args, limit + 1);
  const newest = found.slice(0, limit);
  const names = await senderNames(deps, newest.map((o) => o.slot));
  const items = newest.filter((o) => names.has(o.slot.agentId)).reverse();
  return { items, names, more: found.length > limit, cursor: items.length ? cursorOf(items[items.length - 1]!.slot) : undefined };
}

/**
 * With a cursor a call is a forward feed: the OLDEST `limit` visible memories after it, and the cursor of the last one
 * returned, so more arrivals than fit are delivered over several calls, none skipped, none repeated. `more` means
 * newer memories remain: call again with the new cursor.
 * A failure that could drop a memory (a batch that did not load, a sender whose name did not resolve) ends the page
 * before it, so the cursor never moves past a memory the agent did not get. A row that is gone or will not decrypt is
 * permanent and is skipped.
 */
async function forwardPage(deps: ReadDeps, args: Scope, limit: number) {
  const { found, truncated, incomplete, newest } = await walk(deps, args, Infinity);
  const noNames = new Map<bigint, string>();
  if (incomplete) return { items: [] as Opened[], names: noNames, more: true, cursor: undefined };
  const oldestFirst = found.reverse();
  const page = oldestFirst.slice(0, limit);
  const names = await senderNames(deps, page.map((o) => o.slot));
  const cut = page.findIndex((o) => !names.has(o.slot.agentId));
  const items = cut === -1 ? page : page.slice(0, cut);
  const more = items.length < oldestFirst.length || truncated;
  // A whole window with nothing visible still has to move the cursor, or the next call would look at it again.
  const cursor = items.length ? cursorOf(items[items.length - 1]!.slot) : oldestFirst.length === 0 && truncated && newest ? cursorOf(newest) : undefined;
  return { items, names, more, cursor };
}

/**
 * The document of each slot, by contentHash: from the session cache, else one batched fetch and a decrypt.
 * A slot that fails or has no row is left out, the others still return.
 */
async function loadDocs(deps: ReadDeps, slots: readonly ChainSlot[]): Promise<{ docs: Map<string, MemoryDoc>; failed: boolean }> {
  const docs = new Map<string, MemoryDoc>();
  const missing = new Map<string, Hex>();
  for (const { contentHash } of slots) {
    const key = contentHash.toLowerCase();
    if (docs.has(key) || missing.has(key)) continue;
    const hit = deps.docs?.get(key);
    if (hit) docs.set(key, hit);
    else missing.set(key, contentHash);
  }
  if (missing.size === 0) return { docs, failed: false };
  let sealed;
  try {
    sealed = await deps.store.getMany([...missing.values()]);
  } catch (e) {
    deps.onError?.("memory", e);
    return { docs, failed: true };
  }
  await Promise.all(
    [...missing].map(async ([key, hash]) => {
      const row = sealed.get(key);
      if (!row) return;
      try {
        const doc = openDoc(await decrypt(row, deps.encryptionKey));
        docs.set(key, doc);
        deps.docs?.set(hash, doc);
      } catch (e) {
        deps.onError?.("memory", e);
      }
    }),
  );
  return { docs, failed: false };
}

/**
 * `hive_read_memory`: the newest visible slots, decrypted in full.
 * Default deny: an error at any stage returns what is safe to return (nothing), never partial plaintext.
 */
export async function readMemory(deps: ReadDeps, args: Scope): Promise<ReadMemoryOutput> {
  try {
    const { items, names, more, cursor } = await newestPage(deps, args);
    const memories = items.map(({ slot, doc }) => ({ ...memoryFields(slot, names.get(slot.agentId)!, doc), content: doc.content }));
    return { memories, more, ...(cursor && { cursor }), ...(memories.length && { notice: MEMORY_NOTICE }) };
  } catch (e) {
    deps.onError?.("permission-check", e);
    return { memories: [], more: false };
  }
}

export const previewOf = (content: string) => [...content].slice(0, PREVIEW_CHARS).join("");
export const bytesOf = (content: string) => new TextEncoder().encode(content).length;

/** `hive_list_memory`: the same selection and permission checks as a read, but each memory is a short preview and a size. */
export async function listMemory(deps: ReadDeps, args: Omit<Scope, "slotIds">): Promise<ListMemoryOutput> {
  try {
    const { items, names, more, cursor } = await newestPage(deps, args);
    const memories = items.map(({ slot, doc }) => ({ ...memoryFields(slot, names.get(slot.agentId)!, doc), bytes: bytesOf(doc.content), preview: previewOf(doc.content) }));
    return { memories, more, ...(cursor && { cursor }), ...(memories.length && { notice: MEMORY_NOTICE }) };
  } catch (e) {
    deps.onError?.("permission-check", e);
    return { memories: [], more: false };
  }
}

export type WriteDeps = {
  /** Needed only to check `supersedes`. */
  chain?: ChainReader;
  writer: ChainWriter;
  store: CiphertextStore;
  /** The agent's own key: it must be the registered writer, and it pays gas (ADR-007). */
  agentKey: Hex;
  encryptionKey: Hex;
  owner: Hex;
  /** Tops the agent key up before the write, so a key that spent its gas since authorize still works. Best effort. */
  ensureGas?: () => Promise<unknown>;
  /** Reports a failure without any memory content. */
  onError?: (stage: string, error: unknown) => void;
};

/** Which key sealed a row, without revealing it: a short domain-separated hash. */
const keyIdOf = (key: Hex) => `hive-key:${keccak256(concatBytes([stringToBytes("hive/key-id"), hexToBytes(key)])).slice(0, 18)}`;

// One transaction at a time per agent key, or two parallel writes race for the same nonce.
const queues = new Map<string, Promise<unknown>>();
async function oneAtATime<T>(agentId: bigint, job: () => Promise<T>): Promise<T> {
  const key = agentId.toString();
  const run = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(job);
  queues.set(key, run);
  try {
    return await run;
  } finally {
    if (queues.get(key) === run) queues.delete(key);
  }
}

/**
 * A memory may only replace one of the same sender and topic. Checked here so a bad id costs no gas, and again when
 * reading, where a forged `supersedes` is ignored.
 */
async function checkSupersedes(deps: WriteDeps, agentId: bigint, topic: string, slotId: bigint): Promise<void> {
  let target;
  try {
    target = await deps.chain?.slot(slotId);
  } catch (e) {
    deps.onError?.("chain", e);
    throw new HiveError("CHAIN_ERROR", "Could not check the memory to replace.");
  }
  if (!target || target.agentId !== agentId || target.topic !== topic) throw new HiveError("INVALID_INPUT", "supersedes must be one of your own memories in the same topic.");
}

/**
 * `hive_write_memory`: encrypt -> store ciphertext -> `MemorySlots.write` from the agent key.
 * The ciphertext goes first: if the chain write then fails, an unreferenced row is harmless, whereas a slot onchain
 * without its ciphertext would be a memory nobody can read. Errors carry a fixed message, never the content.
 */
export async function writeMemory(deps: WriteDeps, args: { agentId: bigint; content: string; topic: string } & MemoryMeta): Promise<WriteMemoryOutput> {
  const { content, gist, kind, entities, supersedes } = args;
  if (supersedes !== undefined) await checkSupersedes(deps, args.agentId, args.topic, supersedes);
  let sealed;
  try {
    sealed = await encrypt(sealDoc({ content, gist, kind, entities, supersedes }), deps.encryptionKey);
  } catch (e) {
    deps.onError?.("encrypt", e);
    throw new HiveError("INTERNAL", "Could not encrypt the memory.");
  }
  try {
    await deps.store.put(sealed.contentHash, { ciphertext: sealed.ciphertext, iv: sealed.iv, owner: deps.owner, keyId: keyIdOf(deps.encryptionKey) });
  } catch (e) {
    deps.onError?.("store", e);
    throw new HiveError("STORAGE_ERROR", "Could not store the memory.");
  }
  await deps.ensureGas?.().catch((e) => deps.onError?.("fund", e));
  try {
    const receipt = await oneAtATime(args.agentId, () => deps.writer.write({ agentKey: deps.agentKey, agentId: args.agentId, contentHash: sealed.contentHash, topic: args.topic }));
    return { slotId: receipt.slotId, contentHash: sealed.contentHash, txHash: zTxHash.parse(receipt.txHash), propagatedTo: receipt.propagatedTo };
  } catch (e) {
    if (e instanceof HiveError) throw e;
    deps.onError?.("chain", e);
    throw new HiveError("CHAIN_ERROR", "Could not write the memory to the chain.");
  }
}
