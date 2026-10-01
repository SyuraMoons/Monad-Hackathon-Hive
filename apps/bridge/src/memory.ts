import { decrypt } from "@hive/crypto";
import type { Hex, ReadMemoryOutput } from "@hive/shared";
import { permittedSlots } from "./permissions.js";
import type { ChainReader, CiphertextStore } from "./types.js";

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
