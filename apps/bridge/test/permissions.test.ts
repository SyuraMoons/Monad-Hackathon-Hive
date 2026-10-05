import { encrypt } from "@hive/crypto";
import type { Hex } from "@hive/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { readMemory, type ReadDeps } from "../src/memory.js";
import { edgeAllows, permittedSlots, topicHash } from "../src/permissions.js";
import { InMemoryChain, InMemoryCiphertextStore } from "../src/stubs.js";
import type { ChainEdge } from "../src/types.js";

const KEY = ("0x" + "33".repeat(32)) as Hex;
const OWNER = "0x00000000000000000000000000000000000000a1";
const NOW = 1_000_000n;
const CLAUDE = 1n;
const CHATGPT = 2n;
const THERAPY = 3n;

const edge = (o: Partial<ChainEdge> = {}): ChainEdge => ({
  id: 1n, from: CLAUDE, to: CHATGPT, topicHash: topicHash("work"), expiresAt: NOW + 100n, active: true, ...o,
});

let chain: InMemoryChain;
let store: InMemoryCiphertextStore;
let deps: ReadDeps;
let errors: string[];
let nextSlot = 1n;

async function write(agentId: bigint, topic: string, content: string, writtenAt = NOW - 10n) {
  const sealed = await encrypt(content, KEY);
  await store.put(sealed.contentHash, { ...sealed, owner: OWNER, keyId: "hive/encrypt" });
  chain.slots.push({ id: nextSlot++, agentId, contentHash: sealed.contentHash, topic, writtenAt });
}

beforeEach(() => {
  chain = new InMemoryChain();
  store = new InMemoryCiphertextStore();
  errors = [];
  nextSlot = 1n;
  for (const [id, name] of [[CLAUDE, "Claude"], [CHATGPT, "ChatGPT"], [THERAPY, "Therapy Bot"]] as const) chain.agents.set(id, { id, name, owner: "0x0000000000000000000000000000000000000001", agentType: "other", writer: "0x0000000000000000000000000000000000000000" });
  deps = { chain, store, encryptionKey: KEY, now: () => NOW, onError: (stage) => errors.push(stage) };
});

describe("AL-12: the four required cases", () => {
  it("valid edge: ChatGPT reads Claude's work memory", async () => {
    chain.edges.push(edge());
    await write(CLAUDE, "work", "Nexus, deadline 13 Okt");
    const out = await readMemory(deps, { agentId: CHATGPT });
    expect(out.memories).toHaveLength(1);
    expect(out.memories[0]).toMatchObject({ content: "Nexus, deadline 13 Okt", fromName: "Claude", topic: "work", fromAgentId: CLAUDE });
  });

  it("no edge: Therapy Bot always gets nothing", async () => {
    chain.edges.push(edge());
    await write(CLAUDE, "work", "secret project");
    for (let i = 0; i < 5; i++) expect((await readMemory(deps, { agentId: THERAPY })).memories).toEqual([]);
  });

  it("expired edge: denied, with the boundary exact (expiresAt == now is expired)", async () => {
    await write(CLAUDE, "work", "old news");
    chain.edges.push(edge({ expiresAt: NOW }));
    expect((await readMemory(deps, { agentId: CHATGPT })).memories).toEqual([]);
    chain.edges[0] = edge({ expiresAt: NOW + 1n });
    expect((await readMemory(deps, { agentId: CHATGPT })).memories).toHaveLength(1);
  });

  it("wrong topic: an edge for 'work' does not release 'health'", async () => {
    chain.edges.push(edge());
    await write(CLAUDE, "health", "private");
    expect((await readMemory(deps, { agentId: CHATGPT })).memories).toEqual([]);
  });

  it("all-topics edge: releases any topic, still bound by direction, expiry and active", async () => {
    chain.edges.push(edge({ topicHash: topicHash("*") }));
    await write(CLAUDE, "brain", "shared brain");
    await write(CLAUDE, "health", "also shared");
    expect((await readMemory(deps, { agentId: CHATGPT })).memories.map((m) => m.topic)).toEqual(["brain", "health"]);
    expect((await readMemory(deps, { agentId: CHATGPT, topic: "brain" })).memories).toHaveLength(1);
    expect((await readMemory(deps, { agentId: CLAUDE })).memories).toEqual([]);
    expect((await readMemory(deps, { agentId: THERAPY })).memories).toEqual([]);
    chain.edges[0] = edge({ topicHash: topicHash("*"), expiresAt: NOW });
    expect((await readMemory(deps, { agentId: CHATGPT })).memories).toEqual([]);
    chain.edges[0] = edge({ topicHash: topicHash("*"), active: false });
    expect((await readMemory(deps, { agentId: CHATGPT })).memories).toEqual([]);
  });

  it("a slot written under topic '*' is never readable, even through an all-topics edge", async () => {
    chain.edges.push(edge({ topicHash: topicHash("*") }));
    await write(CLAUDE, "*", "sneaky");
    expect((await readMemory(deps, { agentId: CHATGPT })).memories).toEqual([]);
  });
});

describe("more deny cases", () => {
  it("a revoked edge denies immediately", async () => {
    await write(CLAUDE, "work", "x");
    chain.edges.push(edge({ active: false }));
    expect((await readMemory(deps, { agentId: CHATGPT })).memories).toEqual([]);
  });

  it("edges are directional: Claude -> ChatGPT does not let Claude read ChatGPT", async () => {
    chain.edges.push(edge());
    await write(CHATGPT, "work", "chatgpt notes");
    expect((await readMemory(deps, { agentId: CLAUDE })).memories).toEqual([]);
  });

  it("an edge from a different sender does not release this sender's memory", async () => {
    chain.edges.push(edge({ from: THERAPY }));
    await write(CLAUDE, "work", "x");
    expect((await readMemory(deps, { agentId: CHATGPT })).memories).toEqual([]);
  });

  it("an agent never reads its own slots through this path", () => {
    const slots = [{ id: 1n, agentId: CHATGPT, contentHash: "0x01" as Hex, topic: "work", writtenAt: 1n }];
    expect(permittedSlots({ reader: CHATGPT, edges: [edge({ from: CHATGPT, to: CHATGPT })], slots, now: NOW })).toEqual([]);
  });

  it("denies slots whose topic is not a valid slug", () => {
    const e = edge({ topicHash: topicHash("Work!") });
    const slots = [{ id: 1n, agentId: CLAUDE, contentHash: "0x01" as Hex, topic: "Work!", writtenAt: 1n }];
    expect(permittedSlots({ reader: CHATGPT, edges: [e], slots, now: NOW })).toEqual([]);
  });

  it("default deny: a chain error returns nothing and reports no content", async () => {
    await write(CLAUDE, "work", "never leaked");
    chain.edgesTo = async () => { throw new Error("rpc down"); };
    expect((await readMemory(deps, { agentId: CHATGPT })).memories).toEqual([]);
    expect(errors).toEqual(["permission-check"]);
  });

  it("a memory that cannot be decrypted is skipped, the others still return", async () => {
    chain.edges.push(edge());
    await write(CLAUDE, "work", "good");
    const bad = await encrypt("bad", ("0x" + "44".repeat(32)) as Hex);
    await store.put(bad.contentHash, { ...bad, owner: OWNER, keyId: "hive/encrypt" });
    chain.slots.push({ id: 99n, agentId: CLAUDE, contentHash: bad.contentHash, topic: "work", writtenAt: NOW - 5n });
    const out = await readMemory(deps, { agentId: CHATGPT });
    expect(out.memories.map((m) => m.content)).toEqual(["good"]);
    expect(errors).toEqual(["memory"]);
  });
});

describe("filters", () => {
  it("honours the topic filter and `since`, oldest first", async () => {
    chain.edges.push(edge(), edge({ id: 2n, topicHash: topicHash("health") }));
    await write(CLAUDE, "work", "w1", NOW - 30n);
    await write(CLAUDE, "health", "h1", NOW - 20n);
    await write(CLAUDE, "work", "w2", NOW - 10n);
    expect((await readMemory(deps, { agentId: CHATGPT })).memories.map((m) => m.content)).toEqual(["w1", "h1", "w2"]);
    expect((await readMemory(deps, { agentId: CHATGPT, topic: "work" })).memories.map((m) => m.content)).toEqual(["w1", "w2"]);
    expect((await readMemory(deps, { agentId: CHATGPT, since: Number(NOW - 15n) })).memories.map((m) => m.content)).toEqual(["w2"]);
  });
});

describe("edgeAllows", () => {
  it("compares topic hashes case-insensitively", () => {
    const e = edge({ topicHash: topicHash("work").toUpperCase().replace("0X", "0x") as Hex });
    expect(edgeAllows(e, { from: CLAUDE, to: CHATGPT, topic: "work", now: NOW })).toBe(true);
  });
});
