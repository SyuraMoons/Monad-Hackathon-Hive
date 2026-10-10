import { encrypt } from "@hive/crypto";
import type { Hex } from "@hive/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { listMemory, readMemory, type ReadDeps } from "../src/memory.js";
import { topicHash } from "../src/permissions.js";
import { DocCache } from "../src/sessions.js";
import { InMemoryChain, InMemoryCiphertextStore } from "../src/stubs.js";

const KEY = ("0x" + "33".repeat(32)) as Hex;
const OWNER = "0x00000000000000000000000000000000000000a1";
const NOW = 1_000_000n;

class CountingStore extends InMemoryCiphertextStore {
  gets = 0;
  manyCalls: number[] = [];
  override async get(hash: Hex) {
    this.gets++;
    return super.get(hash);
  }
  override async getMany(hashes: readonly Hex[]) {
    this.manyCalls.push(hashes.length);
    return super.getMany(hashes);
  }
}

let chain: InMemoryChain;
let store: CountingStore;
let deps: ReadDeps;
let errors: string[];
let next = 1n;

async function write(agentId: bigint, content: string, writtenAt = NOW - 10n) {
  const sealed = await encrypt(content, KEY);
  await store.put(sealed.contentHash, { ...sealed, owner: OWNER, keyId: "k" });
  chain.slots.push({ id: next++, agentId, contentHash: sealed.contentHash, topic: "work", writtenAt });
}

beforeEach(() => {
  chain = new InMemoryChain();
  store = new CountingStore();
  errors = [];
  next = 1n;
  for (const [id, name] of [[1n, "Claude"], [2n, "ChatGPT"]] as const) chain.agents.set(id, { id, name, owner: "0x0000000000000000000000000000000000000001", agentType: "other", writer: "0x0000000000000000000000000000000000000000" });
  chain.edges.push({ id: 1n, from: 1n, to: 2n, topicHash: topicHash("work"), expiresAt: NOW + 100n, active: true });
  deps = { chain, store, encryptionKey: KEY, now: () => NOW, docs: new DocCache(), onError: (s) => errors.push(s) };
});

describe("batched fetch", () => {
  it("asks the store once for all selected slots", async () => {
    for (let i = 0; i < 5; i++) await write(1n, `note ${i}`, NOW - BigInt(10 + i));
    const out = await readMemory(deps, { agentId: 2n });
    expect(out.memories.map((m) => m.content)).toEqual(["note 4", "note 3", "note 2", "note 1", "note 0"]);
    expect(store.manyCalls).toEqual([5]);
    expect(store.gets).toBe(0);
  });

  it("skips a slot with no stored row and still returns the others", async () => {
    await write(1n, "kept");
    chain.slots.push({ id: next++, agentId: 1n, contentHash: ("0x" + "ab".repeat(32)) as Hex, topic: "work", writtenAt: NOW - 5n });
    const out = await readMemory(deps, { agentId: 2n });
    expect(out.memories.map((m) => m.content)).toEqual(["kept"]);
    expect(errors).toEqual([]);
  });

  it("reports a failed batch as a stage name only and returns nothing", async () => {
    await write(1n, "secret note");
    store.getMany = async () => {
      throw new Error("db down secret note");
    };
    const out = await readMemory(deps, { agentId: 2n });
    expect(out.memories).toEqual([]);
    expect(errors).toEqual(["memory"]);
  });
});

describe("session cache", () => {
  it("serves a repeat call without touching the store", async () => {
    await write(1n, "a");
    await write(1n, "b");
    await listMemory(deps, { agentId: 2n });
    expect(store.manyCalls).toEqual([2]);
    const again = await readMemory(deps, { agentId: 2n });
    expect(again.memories).toHaveLength(2);
    expect(store.manyCalls).toEqual([2]);
  });

  it("fetches only the slots it has not seen", async () => {
    await write(1n, "a");
    await readMemory(deps, { agentId: 2n });
    await write(1n, "b");
    await readMemory(deps, { agentId: 2n });
    expect(store.manyCalls).toEqual([1, 1]);
  });

  it("still checks the chain on every call: a revoke blocks a cached memory", async () => {
    await write(1n, "a");
    expect((await readMemory(deps, { agentId: 2n })).memories).toHaveLength(1);
    chain.edges[0]!.active = false;
    expect((await readMemory(deps, { agentId: 2n })).memories).toEqual([]);
  });

  it("evicts the least recently used entry", () => {
    const cache = new DocCache(2);
    cache.set("0xa", { content: "a" });
    cache.set("0xb", { content: "b" });
    cache.get("0xa");
    cache.set("0xc", { content: "c" });
    expect(cache.get("0xb")).toBeUndefined();
    expect(cache.get("0xa")).toEqual({ content: "a" });
    expect(cache.size).toBe(2);
  });
});
