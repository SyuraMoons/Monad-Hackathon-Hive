import { decrypt, encrypt } from "@hive/crypto";
import { HiveError, zTxHash, type Hex, type ReadMemoryOutput, type WriteMemoryOutput } from "@hive/shared";
import { concatBytes, hexToBytes, keccak256, stringToBytes } from "viem";
import { permittedSlots } from "./permissions.js";
import type { ChainReader, ChainWriter, CiphertextStore } from "./types.js";

export type ReadDeps = {
  chain: ChainReader;
  store: CiphertextStore;
  /** The owner's delegated encryption key for this agent's session. */
  encryptionKey: Hex;
  now: () => bigint;
  /** Reports a failure without any memory content. */
  onError?: (stage: string, error: unknown) => void;
};

/**
 * `hive_read_memory`: incoming edges -> slots since `since` from each sender -> permission filter -> decrypt.
 * Default deny: an error at any stage returns what is safe to return (nothing), never partial plaintext.
 */
export async function readMemory(deps: ReadDeps, args: { agentId: bigint; since?: number; topic?: string }): Promise<ReadMemoryOutput> {
  const empty: ReadMemoryOutput = { memories: [] };
  try {
    const now = deps.now();
    const edges = await deps.chain.edgesTo(args.agentId);
    const senders = [...new Set(edges.map((e) => e.from))].filter((id) => id !== args.agentId);
    const since = BigInt(args.since ?? 0);
    const slots = (await Promise.all(senders.map((id) => deps.chain.slotsSince(id, since)))).flat();
    const allowed = permittedSlots({ reader: args.agentId, edges, slots, now, topic: args.topic });

    const names = new Map<bigint, string>();
    const memories: ReadMemoryOutput["memories"] = [];
    for (const slot of allowed.sort((a, b) => Number(a.writtenAt - b.writtenAt) || Number(a.id - b.id))) {
      try {
        const sealed = await deps.store.get(slot.contentHash);
        if (!sealed) continue;
        if (!names.has(slot.agentId)) names.set(slot.agentId, (await deps.chain.agent(slot.agentId)).name);
        memories.push({
          slotId: slot.id,
          fromAgentId: slot.agentId,
          fromName: names.get(slot.agentId)!,
          topic: slot.topic as ReadMemoryOutput["memories"][number]["topic"],
          content: await decrypt(sealed, deps.encryptionKey),
          writtenAt: Number(slot.writtenAt),
        });
      } catch (e) {
        deps.onError?.("memory", e);
      }
    }
    return { memories };
  } catch (e) {
    deps.onError?.("permission-check", e);
    return empty;
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
  try {
    const receipt = await oneAtATime(args.agentId, () => deps.writer.write({ agentKey: deps.agentKey, agentId: args.agentId, contentHash: sealed.contentHash, topic: args.topic }));
    return { slotId: receipt.slotId, contentHash: sealed.contentHash, txHash: zTxHash.parse(receipt.txHash), propagatedTo: receipt.propagatedTo };
  } catch (e) {
    if (e instanceof HiveError) throw e;
    deps.onError?.("chain", e);
    throw new HiveError("CHAIN_ERROR", "Could not write the memory to the chain.");
  }
}
