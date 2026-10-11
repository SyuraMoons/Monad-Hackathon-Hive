import { encrypt } from "@hive/crypto";
import type { Hex } from "@hive/shared";
import { MEMORY_NOTICE } from "@hive/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { UNAVAILABLE_NOTICE, listMemory, readMemory, type ReadDeps } from "../src/memory.js";
import { topicHash } from "../src/permissions.js";
import { searchMemory } from "../src/search.js";
import { DocCache } from "../src/sessions.js";
import { InMemoryChain, InMemoryCiphertextStore } from "../src/stubs.js";

const KEY = ("0x" + "33".repeat(32)) as Hex;
const OWNER = "0x00000000000000000000000000000000000000a1";
const NOW = 1_000_000n;

let chain: InMemoryChain;
let store: InMemoryCiphertextStore;
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
  store = new InMemoryCiphertextStore();
  errors = [];
  next = 1n;
  for (const [id, name] of [[1n, "Claude"], [2n, "ChatGPT"]] as const) chain.agents.set(id, { id, name, owner: "0x0000000000000000000000000000000000000001", agentType: "other", writer: "0x0000000000000000000000000000000000000000" });
  chain.edges.push({ id: 1n, from: 1n, to: 2n, topicHash: topicHash("work"), expiresAt: NOW + 100n, active: true });
  deps = { chain, store, encryptionKey: KEY, now: () => NOW, docs: new DocCache(), onError: (s) => errors.push(s) };
});

const failOnCall = (n: number) => {
  let calls = 0;
  const real = store.getMany.bind(store);
  store.getMany = async (hashes) => {
    if (++calls === n) throw new Error("db down secret note");
    return real(hashes);
  };
};

describe("a read that a failure shortened says so", () => {
  it("a clean read has no retry hint and nothing left out", async () => {
    await write(1n, "a");
    const out = await readMemory(deps, { agentId: 2n });
    expect(out.more).toBe(false);
    expect(out.notice).toBe(MEMORY_NOTICE);
  });

  it("a batch that did not load is `more: true` with a retry notice, never `more: false`", async () => {
    await write(1n, "secret note");
    failOnCall(1);
    for (const read of [readMemory, listMemory]) {
      const out = await read(deps, { agentId: 2n });
      expect(out.memories).toEqual([]);
      expect(out.more).toBe(true);
      expect(out.notice).toContain("Call again to retry");
      expect(out.notice).not.toContain("secret note");
      failOnCall(1);
    }
    expect(errors).toEqual(["memory", "memory"]);
  });

  it("keeps the memories it did load and says some are missing", async () => {
    // 70 slots, page size 60: the first batch loads, the second does not.
    for (let i = 0; i < 70; i++) await write(1n, `note ${i}`, NOW - BigInt(100 - i));
    failOnCall(2);
    const out = await readMemory(deps, { agentId: 2n, limit: 100 });
    expect(out.memories).toHaveLength(60);
    expect(out.more).toBe(true);
    expect(out.notice).toContain(MEMORY_NOTICE);
    expect(out.notice).toContain("Call again to retry");
  });

  it("a sender whose name did not resolve is left out and the page says so", async () => {
    await write(1n, "from claude");
    chain.agents.delete(1n);
    const out = await readMemory(deps, { agentId: 2n });
    expect(out.memories).toEqual([]);
    expect(out.more).toBe(true);
    expect(out.notice).toContain("Call again to retry");
  });

  it("a chain read that throws is not 'nothing shared'", async () => {
    await write(1n, "a");
    chain.edgesTo = async () => {
      throw new Error("rpc https://rpc.example/key");
    };
    for (const read of [readMemory, listMemory]) {
      const out = await read(deps, { agentId: 2n });
      expect(out).toEqual({ memories: [], more: true, notice: UNAVAILABLE_NOTICE });
    }
    expect(errors).toEqual(["permission-check", "permission-check"]);
  });

  it("a forward feed with a failed batch stays put and says why", async () => {
    await write(1n, "a");
    failOnCall(1);
    const out = await readMemory(deps, { agentId: 2n, cursor: "0:0" });
    expect(out).toMatchObject({ memories: [], more: true });
    expect(out.cursor).toBeUndefined();
    expect(out.notice).toContain("Call again to retry");
  });
});

describe("search says so too", () => {
  it("a failed batch", async () => {
    await write(1n, "alpha beta");
    failOnCall(1);
    const out = await searchMemory(deps, { agentId: 2n, query: "alpha" });
    expect(out.memories).toEqual([]);
    expect(out.notice).toContain("Call again to retry");
  });

  it("a chain read that throws", async () => {
    await write(1n, "alpha beta");
    chain.edgesTo = async () => {
      throw new Error("rpc down");
    };
    const out = await searchMemory(deps, { agentId: 2n, query: "alpha" });
    expect(out).toEqual({ memories: [], mode: "lexical", notice: UNAVAILABLE_NOTICE });
  });

  it("a clean search with no match has no notice", async () => {
    await write(1n, "alpha beta");
    const out = await searchMemory(deps, { agentId: 2n, query: "zzzz" });
    expect(out.memories).toEqual([]);
    expect(out.notice).toBeUndefined();
  });
});
