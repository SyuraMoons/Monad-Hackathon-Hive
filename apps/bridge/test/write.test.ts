import { contentHash as hashOf, decrypt } from "@hive/crypto";
import { HiveError, type Hex } from "@hive/shared";
import { describe, expect, it } from "vitest";
import { writeMemory, type WriteDeps } from "../src/memory.js";
import { InMemoryCiphertextStore } from "../src/stubs.js";
import type { ChainWriter, NewCiphertext } from "../src/types.js";

const OWNER = "0x00000000000000000000000000000000000000a1" as Hex;
const AGENT_KEY = ("0x" + "11".repeat(32)) as Hex;
const ENC_KEY = ("0x" + "33".repeat(32)) as Hex;
const TX = ("0x" + "cc".repeat(32)) as Hex;
const SECRET = "Nexus, deadline 13 Okt";

class SpyStore extends InMemoryCiphertextStore {
  puts: Array<{ hash: Hex; value: NewCiphertext }> = [];
  fail = false;
  override async put(hash: Hex, value: NewCiphertext) {
    if (this.fail) throw new Error(`supabase said no about ${SECRET}`);
    this.puts.push({ hash, value });
    await super.put(hash, value);
  }
}

function setup() {
  const store = new SpyStore();
  const order: string[] = [];
  const writes: Array<Parameters<ChainWriter["write"]>[0]> = [];
  let active = 0;
  let maxActive = 0;
  const state = { fail: false, delayMs: 0 };
  const writer: ChainWriter = {
    async write(args) {
      order.push("chain");
      writes.push(args);
      active++;
      maxActive = Math.max(maxActive, active);
      try {
        if (state.delayMs) await new Promise((r) => setTimeout(r, state.delayMs));
        if (state.fail) throw new Error(`rpc exploded for ${SECRET}`);
        return { txHash: TX, slotId: 7n, propagatedTo: [2n, 3n] };
      } finally {
        active--;
      }
    },
  };
  const origPut = store.put.bind(store);
  store.put = async (h, v) => { order.push("store"); return origPut(h, v); };
  const deps: WriteDeps = { writer, store, agentKey: AGENT_KEY, encryptionKey: ENC_KEY, owner: OWNER };
  return { store, writer, deps, order, writes, state, maxActive: () => maxActive };
}

describe("writeMemory", () => {
  it("stores only ciphertext that decrypts back, keyed by keccak256(iv ‖ ciphertext)", async () => {
    const { deps, store } = setup();
    const out = await writeMemory(deps, { agentId: 1n, topic: "work", content: SECRET });
    const [row] = store.puts;
    expect(row?.hash).toBe(out.contentHash);
    expect(hashOf(row!.value.iv, row!.value.ciphertext)).toBe(out.contentHash);
    expect(Buffer.from(row!.value.ciphertext).toString("utf8")).not.toContain(SECRET);
    expect(await decrypt(row!.value, ENC_KEY)).toBe(SECRET);
  });

  it("records the owner and a key id that is not the key", async () => {
    const { deps, store } = setup();
    await writeMemory(deps, { agentId: 1n, topic: "work", content: SECRET });
    const { owner, keyId } = store.puts[0]!.value;
    expect(owner).toBe(OWNER);
    expect(keyId).toMatch(/^hive-key:0x[0-9a-f]{16}$/);
    expect(keyId).not.toContain(ENC_KEY.slice(2, 18));
  });

  it("stores the ciphertext before it writes to the chain, and sends the right arguments", async () => {
    const { deps, order, writes } = setup();
    const out = await writeMemory(deps, { agentId: 1n, topic: "work", content: SECRET });
    expect(order).toEqual(["store", "chain"]);
    expect(writes).toEqual([{ agentKey: AGENT_KEY, agentId: 1n, contentHash: out.contentHash, topic: "work" }]);
  });

  it("returns slot, tx and the agents the contract propagated to", async () => {
    const { deps } = setup();
    expect(await writeMemory(deps, { agentId: 1n, topic: "work", content: SECRET })).toMatchObject({ slotId: 7n, txHash: TX, propagatedTo: [2n, 3n] });
  });

  it("a chain failure is CHAIN_ERROR and never carries the content", async () => {
    const { deps, state } = setup();
    state.fail = true;
    const err = await writeMemory(deps, { agentId: 1n, topic: "work", content: SECRET }).catch((e) => e);
    expect(err).toBeInstanceOf(HiveError);
    expect(err.code).toBe("CHAIN_ERROR");
    expect(JSON.stringify(err.toEnvelope())).not.toContain("Nexus");
  });

  it("a store failure is STORAGE_ERROR, never reaches the chain, and never carries the content", async () => {
    const { deps, store, order } = setup();
    store.fail = true;
    const err = await writeMemory(deps, { agentId: 1n, topic: "work", content: SECRET }).catch((e) => e);
    expect(err.code).toBe("STORAGE_ERROR");
    expect(JSON.stringify(err.toEnvelope())).not.toContain("Nexus");
    expect(order).not.toContain("chain");
  });

  it("passes a HiveError from the writer through unchanged", async () => {
    const { deps, writer } = setup();
    writer.write = async () => { throw new HiveError("CHAIN_ERROR", "The agent key has no MON for gas."); };
    await expect(writeMemory(deps, { agentId: 1n, topic: "work", content: SECRET })).rejects.toThrow("no MON for gas");
  });

  it("serialises writes from one agent but lets different agents run in parallel", async () => {
    const same = setup();
    same.state.delayMs = 15;
    await Promise.all([1, 2, 3].map(() => writeMemory(same.deps, { agentId: 1n, topic: "work", content: SECRET })));
    expect(same.maxActive()).toBe(1);

    const diff = setup();
    diff.state.delayMs = 15;
    await Promise.all([1n, 2n, 3n].map((id) => writeMemory(diff.deps, { agentId: id, topic: "work", content: SECRET })));
    expect(diff.maxActive()).toBeGreaterThan(1);
  });

  it("a failed write does not block the next one from the same agent", async () => {
    const { deps, state } = setup();
    state.fail = true;
    await expect(writeMemory(deps, { agentId: 1n, topic: "work", content: SECRET })).rejects.toThrow();
    state.fail = false;
    await expect(writeMemory(deps, { agentId: 1n, topic: "work", content: SECRET })).resolves.toMatchObject({ slotId: 7n });
  });
});
