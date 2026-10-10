import { decrypt, encrypt } from "@hive/crypto";
import { HiveError, MEMORY_PAGE_DEFAULT, PREVIEW_CHARS, zTxHash, type Hex, type ListMemoryOutput, type ReadMemoryOutput, type WriteMemoryOutput } from "@hive/shared";
import { concatBytes, hexToBytes, keccak256, stringToBytes } from "viem";
import { permittedSlots } from "./permissions.js";
import type { ChainReader, ChainSlot, ChainWriter, CiphertextStore } from "./types.js";

export type ReadDeps = {
  chain: ChainReader;
  store: CiphertextStore;
  /** The owner's delegated encryption key for this agent's session. */
  encryptionKey: Hex;
  now: () => bigint;
  /** Tops the agent key up before the write, so a key that spent its gas since authorize still works. Best effort. */
  ensureGas?: () => Promise<unknown>;
  /** Reports a failure without any memory content. */
  onError?: (stage: string, error: unknown) => void;
};

type Selection = { slots: ChainSlot[]; more: boolean };

/**
 * incoming edges -> slots since `since` from each sender -> permission filter -> `slotIds` filter -> newest `limit`.
 * `slotIds` only narrows the permitted set: an id the reader has no edge for is dropped, never fetched.
 */
async function selectSlots(deps: ReadDeps, args: ReadArgs): Promise<Selection> {
  const now = deps.now();
  const edges = await deps.chain.edgesTo(args.agentId);
  const senders = [...new Set(edges.map((e) => e.from))].filter((id) => id !== args.agentId);
  const since = BigInt(args.since ?? 0);
  const slots = (await Promise.all(senders.map((id) => deps.chain.slotsSince(id, since)))).flat();
  let allowed = permittedSlots({ reader: args.agentId, edges, slots, now, topic: args.topic });
  if (args.slotIds) {
    const wanted = new Set(args.slotIds);
    allowed = allowed.filter((s) => wanted.has(s.id));
  }
  const oldestFirst = (a: ChainSlot, b: ChainSlot) => Number(a.writtenAt - b.writtenAt) || Number(a.id - b.id);
  const limit = args.limit ?? MEMORY_PAGE_DEFAULT;
  const sorted = allowed.sort(oldestFirst);
  return { slots: sorted.slice(-limit), more: sorted.length > limit };
}

type ReadArgs = { agentId: bigint; since?: number; topic?: string; slotIds?: bigint[]; limit?: number };

/** Decrypts each selected slot and hands the plaintext to `shape`. A slot that fails is skipped, the others still return. */
async function openSlots<T>(deps: ReadDeps, slots: ChainSlot[], shape: (slot: ChainSlot, name: string, content: string) => T): Promise<T[]> {
  const names = new Map<bigint, string>();
  const out: T[] = [];
  for (const slot of slots) {
    try {
      const sealed = await deps.store.get(slot.contentHash);
      if (!sealed) continue;
      if (!names.has(slot.agentId)) names.set(slot.agentId, (await deps.chain.agent(slot.agentId)).name);
      out.push(shape(slot, names.get(slot.agentId)!, await decrypt(sealed, deps.encryptionKey)));
    } catch (e) {
      deps.onError?.("memory", e);
    }
  }
  return out;
}

const topicOf = (slot: ChainSlot) => slot.topic as ReadMemoryOutput["memories"][number]["topic"];

/**
 * `hive_read_memory`: the newest permitted slots, decrypted in full.
 * Default deny: an error at any stage returns what is safe to return (nothing), never partial plaintext.
 */
export async function readMemory(deps: ReadDeps, args: ReadArgs): Promise<ReadMemoryOutput> {
  try {
    const { slots, more } = await selectSlots(deps, args);
    const memories = await openSlots(deps, slots, (slot, name, content) => ({
      slotId: slot.id,
      fromAgentId: slot.agentId,
      fromName: name,
      topic: topicOf(slot),
      content,
      writtenAt: Number(slot.writtenAt),
    }));
    return { memories, more };
  } catch (e) {
    deps.onError?.("permission-check", e);
    return { memories: [], more: false };
  }
}

/** `hive_list_memory`: the same selection and permission checks as a read, but each memory is a short preview and a size. */
export async function listMemory(deps: ReadDeps, args: Omit<ReadArgs, "slotIds">): Promise<ListMemoryOutput> {
  try {
    const { slots, more } = await selectSlots(deps, args);
    const memories = await openSlots(deps, slots, (slot, name, content) => ({
      slotId: slot.id,
      fromAgentId: slot.agentId,
      fromName: name,
      topic: topicOf(slot),
      writtenAt: Number(slot.writtenAt),
      bytes: new TextEncoder().encode(content).length,
      preview: [...content].slice(0, PREVIEW_CHARS).join(""),
    }));
    return { memories, more };
  } catch (e) {
    deps.onError?.("permission-check", e);
    return { memories: [], more: false };
  }
}

export type WriteDeps = {
  writer: ChainWriter;
  store: CiphertextStore;
  /** The agent's own key: it must be the registered writer, and it pays gas (ADR-007). */
  agentKey: Hex;
  encryptionKey: Hex;
  owner: Hex;
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
 * `hive_write_memory`: encrypt -> store ciphertext -> `MemorySlots.write` from the agent key.
 * The ciphertext goes first: if the chain write then fails, an unreferenced row is harmless, whereas a slot onchain
 * without its ciphertext would be a memory nobody can read. Errors carry a fixed message, never the content.
 */
export async function writeMemory(deps: WriteDeps, args: { agentId: bigint; content: string; topic: string }): Promise<WriteMemoryOutput> {
  let sealed;
  try {
    sealed = await encrypt(args.content, deps.encryptionKey);
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
