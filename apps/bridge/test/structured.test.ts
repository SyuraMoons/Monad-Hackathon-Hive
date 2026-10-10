import { decrypt, encrypt } from "@hive/crypto";
import { HiveError, MEMORY_ENVELOPE_PREFIX, MEMORY_NOTICE, sealDoc, type Hex } from "@hive/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { listMemory, readMemory, writeMemory, type ReadDeps, type WriteDeps } from "../src/memory.js";
import { topicHash } from "../src/permissions.js";
import { DocCache } from "../src/sessions.js";
import { InMemoryChain, InMemoryCiphertextStore } from "../src/stubs.js";

const KEY = ("0x" + "33".repeat(32)) as Hex;
const OWNER = "0x00000000000000000000000000000000000000a1";
const NOW = 1_000_000n;
const [CLAUDE, CHATGPT, THERAPY] = [1n, 2n, 3n];

let chain: InMemoryChain;
let store: InMemoryCiphertextStore;
let deps: ReadDeps;
let errors: string[];
let next = 1n;

type Doc = Parameters<typeof sealDoc>[0];

/** Writes a slot the way the bridge would, and returns its id. */
async function put(agentId: bigint, topic: string, doc: Doc | string, writtenAt = NOW - 100n + next) {
  const sealed = await encrypt(typeof doc === "string" ? doc : sealDoc(doc), KEY);
  await store.put(sealed.contentHash, { ...sealed, owner: OWNER, keyId: "k" });
  const id = next++;
  chain.slots.push({ id, agentId, contentHash: sealed.contentHash, topic, writtenAt });
  return id;
}
const contents = async (args: Parameters<typeof readMemory>[1]) => (await readMemory(deps, args)).memories.map((m) => m.content);

beforeEach(() => {
  chain = new InMemoryChain();
  store = new InMemoryCiphertextStore();
  errors = [];
  next = 1n;
  for (const [id, name] of [[CLAUDE, "Claude"], [CHATGPT, "ChatGPT"], [THERAPY, "Therapy Bot"]] as const) chain.agents.set(id, { id, name, owner: "0x0000000000000000000000000000000000000001", agentType: "other", writer: "0x0000000000000000000000000000000000000000" });
  chain.edges.push({ id: 1n, from: CLAUDE, to: CHATGPT, topicHash: topicHash("*"), expiresAt: NOW + 1000n, active: true });
  deps = { chain, store, encryptionKey: KEY, now: () => NOW, docs: new DocCache(), onError: (s) => errors.push(s) };
});

describe("structured fields", () => {
  it("returns gist, kind and entities with read and list, and a notice", async () => {
    await put(CLAUDE, "work", { content: "We picked Postgres for the audit log.", gist: "DB: Postgres", kind: "decision", entities: ["postgres", "0xabc"] });
    const read = await readMemory(deps, { agentId: CHATGPT });
    expect(read.memories[0]).toMatchObject({ content: "We picked Postgres for the audit log.", gist: "DB: Postgres", kind: "decision", entities: ["postgres", "0xabc"] });
    expect(read.notice).toBe(MEMORY_NOTICE);
    const list = await listMemory(deps, { agentId: CHATGPT });
    expect(list.memories[0]).toMatchObject({ gist: "DB: Postgres", kind: "decision", bytes: 37, preview: "We picked Postgres for the audit log." });
    expect(list.memories[0]).not.toHaveProperty("content");
  });

  it("reads a legacy memory with no gist, and says nothing extra when empty", async () => {
    await put(CLAUDE, "work", "plain old note");
    const out = await readMemory(deps, { agentId: CHATGPT });
    expect(out.memories[0]).toMatchObject({ content: "plain old note" });
    expect(out.memories[0]).not.toHaveProperty("gist");
    expect(await readMemory(deps, { agentId: THERAPY })).toEqual({ memories: [], more: false });
  });

  it("filters by kind", async () => {
    await put(CLAUDE, "work", { content: "iface", kind: "interface" });
    await put(CLAUDE, "work", { content: "task", kind: "task" });
    await put(CLAUDE, "work", "legacy");
    expect(await contents({ agentId: CHATGPT, kind: "interface" })).toEqual(["iface"]);
  });
});

describe("supersedes", () => {
  it("hides the old version and shows it again on request", async () => {
    const v1 = await put(CLAUDE, "work", "deploy to Vercel");
    await put(CLAUDE, "work", { content: "deploy to Railway", supersedes: v1 });
    expect(await contents({ agentId: CHATGPT })).toEqual(["deploy to Railway"]);
    expect(await contents({ agentId: CHATGPT, includeSuperseded: true })).toEqual(["deploy to Vercel", "deploy to Railway"]);
    expect(await contents({ agentId: CHATGPT, slotIds: [v1] })).toEqual(["deploy to Vercel"]);
  });

  it("resolves a chain of versions to the newest", async () => {
    const v1 = await put(CLAUDE, "work", "v1");
    const v2 = await put(CLAUDE, "work", { content: "v2", supersedes: v1 });
    await put(CLAUDE, "work", { content: "v3", supersedes: v2 });
    expect(await contents({ agentId: CHATGPT })).toEqual(["v3"]);
  });

  it("ignores a supersedes that points at another sender's or another topic's slot", async () => {
    chain.edges.push({ id: 2n, from: THERAPY, to: CHATGPT, topicHash: topicHash("*"), expiresAt: NOW + 1000n, active: true });
    const theirs = await put(THERAPY, "work", "therapy note");
    const otherTopic = await put(CLAUDE, "personal", "personal note");
    await put(CLAUDE, "work", { content: "forged", supersedes: theirs });
    await put(CLAUDE, "work", { content: "forged too", supersedes: otherTopic });
    expect(await contents({ agentId: CHATGPT })).toEqual(["therapy note", "personal note", "forged", "forged too"]);
  });

  it("hides across the page boundary", async () => {
    const old = await put(CLAUDE, "work", "the very first");
    for (let i = 0; i < 130; i++) await put(CLAUDE, "work", `filler ${i}`);
    await put(CLAUDE, "work", { content: "the replacement", supersedes: old });
    const all = await contents({ agentId: CHATGPT, limit: 50 });
    expect(all).toHaveLength(50);
    expect(all.at(-1)).toBe("the replacement");
    const full = await readMemory(deps, { agentId: CHATGPT, limit: 50, since: 0 });
    expect(full.memories.map((m) => m.content)).not.toContain("the very first");
  });

  it("does not hide anything the reader could not see anyway", async () => {
    const old = await put(CLAUDE, "work", "old");
    await put(CLAUDE, "work", { content: "new", supersedes: old });
    chain.edges[0]!.active = false;
    expect(await contents({ agentId: CHATGPT })).toEqual([]);
  });
});

describe("state slots", () => {
  it("shows only the newest state per sender and topic", async () => {
    await put(CLAUDE, "work", { content: "state A1", kind: "state" });
    await put(CLAUDE, "work", { content: "a fact" });
    await put(CLAUDE, "work", { content: "state A2", kind: "state" });
    await put(CLAUDE, "personal", { content: "personal state", kind: "state" });
    expect(await contents({ agentId: CHATGPT, kind: "state" })).toEqual(["state A2", "personal state"]);
    expect(await contents({ agentId: CHATGPT, kind: "state", topic: "work" })).toEqual(["state A2"]);
    expect(await contents({ agentId: CHATGPT, includeSuperseded: true, kind: "state", topic: "work" })).toEqual(["state A1", "state A2"]);
  });

  it("keeps one state per sender", async () => {
    chain.edges.push({ id: 2n, from: THERAPY, to: CHATGPT, topicHash: topicHash("*"), expiresAt: NOW + 1000n, active: true });
    await put(CLAUDE, "work", { content: "claude state", kind: "state" });
    await put(THERAPY, "work", { content: "therapy state", kind: "state" });
    expect((await contents({ agentId: CHATGPT, kind: "state" })).sort()).toEqual(["claude state", "therapy state"]);
  });
});

describe("mine", () => {
  it("is off by default: an agent does not see its own writes in a normal read", async () => {
    await put(CHATGPT, "work", "my own note");
    expect(await contents({ agentId: CHATGPT })).toEqual([]);
  });

  it("reads only the caller's own slots, with no edge needed", async () => {
    await put(CHATGPT, "work", "my own note");
    await put(CLAUDE, "work", "claude's note");
    expect(await contents({ agentId: CHATGPT, mine: true })).toEqual(["my own note"]);
    expect(await contents({ agentId: THERAPY, mine: true })).toEqual([]);
    const out = await readMemory(deps, { agentId: CHATGPT, mine: true });
    expect(out.memories[0]).toMatchObject({ fromAgentId: CHATGPT, fromName: "ChatGPT" });
  });

  it("returns the caller's own newest state so it can merge before rewriting", async () => {
    await put(CHATGPT, "work", { content: "my state v1", kind: "state" });
    await put(CHATGPT, "work", { content: "my state v2", kind: "state" });
    expect(await contents({ agentId: CHATGPT, mine: true, kind: "state", topic: "work" })).toEqual(["my state v2"]);
  });

  it("does not let mine reach another agent's slots, whatever the ids", async () => {
    const theirs = await put(CLAUDE, "work", "claude's note");
    expect(await contents({ agentId: CHATGPT, mine: true, slotIds: [theirs] })).toEqual([]);
  });
});

describe("cursor", () => {
  it("returns the newest slot's cursor and then only what is newer", async () => {
    await put(CLAUDE, "work", "one");
    await put(CLAUDE, "work", "two");
    const first = await readMemory(deps, { agentId: CHATGPT });
    expect(first.cursor).toMatch(/^\d+:2$/);
    expect(await contents({ agentId: CHATGPT, cursor: first.cursor })).toEqual([]);
    await put(CLAUDE, "work", "three");
    const next = await readMemory(deps, { agentId: CHATGPT, cursor: first.cursor });
    expect(next.memories.map((m) => m.content)).toEqual(["three"]);
    expect(next.cursor).toMatch(/:3$/);
  });

  it("does not repeat a slot written in the same second as the cursor, and does not skip its neighbour", async () => {
    const at = NOW - 5n;
    await put(CLAUDE, "work", "a", at);
    await put(CLAUDE, "work", "b", at);
    const first = await listMemory(deps, { agentId: CHATGPT, limit: 1 });
    expect(first.memories.map((m) => m.preview)).toEqual(["b"]);
    await put(CLAUDE, "work", "c", at);
    expect((await listMemory(deps, { agentId: CHATGPT, cursor: first.cursor })).memories.map((m) => m.preview)).toEqual(["c"]);
  });

  it("gives no cursor when nothing came back", async () => {
    expect((await readMemory(deps, { agentId: CHATGPT })).cursor).toBeUndefined();
  });

  it("combines with since: the later one wins", async () => {
    await put(CLAUDE, "work", "early", NOW - 50n);
    await put(CLAUDE, "work", "late", NOW - 10n);
    expect(await contents({ agentId: CHATGPT, since: Number(NOW - 20n), cursor: `${NOW - 60n}:0` })).toEqual(["late"]);
  });
});

describe("a revoke is immediate, with the cache warm", () => {
  it("returns nothing on the very next call", async () => {
    await put(CLAUDE, "work", { content: "secret plan", gist: "plan", kind: "state" });
    expect(await contents({ agentId: CHATGPT })).toHaveLength(1);
    chain.edges[0]!.active = false;
    expect((await readMemory(deps, { agentId: CHATGPT })).memories).toEqual([]);
    expect((await listMemory(deps, { agentId: CHATGPT, kind: "state" })).memories).toEqual([]);
    expect(errors).toEqual([]);
  });
});

describe("writeMemory with metadata", () => {
  class Spy extends InMemoryCiphertextStore {
    puts = 0;
    override async put(...a: Parameters<InMemoryCiphertextStore["put"]>) {
      this.puts++;
      return super.put(...a);
    }
  }
  let spy: Spy;
  let wdeps: WriteDeps;
  let gasCalls: number;

  beforeEach(() => {
    spy = new Spy();
    deps.store = spy;
    gasCalls = 0;
    wdeps = {
      chain,
      store: spy,
      encryptionKey: KEY,
      owner: OWNER,
      agentKey: KEY,
      ensureGas: async () => void gasCalls++,
      writer: { write: async ({ agentId, contentHash, topic }) => { const id = next++; chain.slots.push({ id, agentId, contentHash, topic, writtenAt: NOW }); return { txHash: ("0x" + "ee".repeat(32)) as Hex, slotId: id, propagatedTo: [] }; } },
    };
  });

  it("seals the envelope, and a read gets the fields back", async () => {
    const out = await writeMemory(wdeps, { agentId: CLAUDE, topic: "work", content: "Use Railway", gist: "host", kind: "decision", entities: ["railway"] });
    const stored = (await spy.getMany([out.contentHash])).get(out.contentHash.toLowerCase())!;
    expect((await decrypt(stored, KEY)).startsWith(MEMORY_ENVELOPE_PREFIX)).toBe(true);
    expect((await readMemory(deps, { agentId: CHATGPT })).memories[0]).toMatchObject({ content: "Use Railway", gist: "host", kind: "decision", entities: ["railway"] });
  });

  it("stores a memory without metadata as plain text", async () => {
    const out = await writeMemory(wdeps, { agentId: CLAUDE, topic: "work", content: "plain" });
    const stored = (await spy.getMany([out.contentHash])).get(out.contentHash.toLowerCase())!;
    expect(await decrypt(stored, KEY)).toBe("plain");
  });

  it("accepts supersedes for the sender's own slot in the same topic", async () => {
    const old = await put(CLAUDE, "work", "v1");
    await writeMemory(wdeps, { agentId: CLAUDE, topic: "work", content: "v2", supersedes: old });
    expect(await contents({ agentId: CHATGPT })).toEqual(["v2"]);
  });

  it.each([
    ["another sender's slot", () => put(THERAPY, "work", "theirs")],
    ["another topic's slot", () => put(CLAUDE, "personal", "elsewhere")],
    ["a slot that does not exist", async () => 999n],
  ])("rejects supersedes pointing at %s, before any storage or gas", async (_name, make) => {
    const target = await make();
    const err = await writeMemory(wdeps, { agentId: CLAUDE, topic: "work", content: "x", supersedes: target }).catch((e) => e);
    expect(err).toBeInstanceOf(HiveError);
    expect(err.code).toBe("INVALID_INPUT");
    expect(err.message).toBe("supersedes must be one of your own memories in the same topic.");
    expect(spy.puts).toBe(0);
    expect(gasCalls).toBe(0);
  });

  it("reports a failing chain check as a fixed message", async () => {
    chain.slot = async () => {
      throw new Error("rpc down with secret url");
    };
    const err = await writeMemory({ ...wdeps, onError: (s) => errors.push(s) }, { agentId: CLAUDE, topic: "work", content: "x", supersedes: 1n }).catch((e) => e);
    expect(err.code).toBe("CHAIN_ERROR");
    expect(err.message).not.toContain("secret");
    expect(errors).toEqual(["chain"]);
    expect(spy.puts).toBe(0);
  });
});
