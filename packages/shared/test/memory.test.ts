import { describe, expect, it } from "vitest";
import { MEMORY_ENVELOPE_PREFIX, openDoc, sealDoc, zMemoryMeta } from "../src/index.js";

describe("memory envelope", () => {
  it("seals a memory with no metadata as plain text", () => {
    expect(sealDoc({ content: "Deadline Oct 13" })).toBe("Deadline Oct 13");
    expect(sealDoc({ content: "x", entities: [] })).toBe("x");
  });

  it("round-trips every field", () => {
    const sealed = sealDoc({ content: "Use Postgres", gist: "DB decision", kind: "decision", entities: ["0xabc", "hive"], supersedes: "12" });
    expect(sealed.startsWith(MEMORY_ENVELOPE_PREFIX)).toBe(true);
    expect(openDoc(sealed)).toEqual({ content: "Use Postgres", gist: "DB decision", kind: "decision", entities: ["0xabc", "hive"], supersedes: 12n });
  });

  it("reads legacy plaintext as content", () => {
    expect(openDoc("just a note")).toEqual({ content: "just a note" });
    expect(openDoc("")).toEqual({ content: "" });
  });

  it("never loses a memory whose envelope is damaged", () => {
    for (const bad of [`${MEMORY_ENVELOPE_PREFIX}{nope`, `${MEMORY_ENVELOPE_PREFIX}{"gist":"no content"}`, `${MEMORY_ENVELOPE_PREFIX}{"content":"x","kind":"weird"}`, `${MEMORY_ENVELOPE_PREFIX}{"content":"x","supersedes":"-1"}`]) {
      expect(openDoc(bad)).toEqual({ content: bad });
    }
  });

  it("keeps content that happens to look like json", () => {
    expect(openDoc('{"content":"x"}')).toEqual({ content: '{"content":"x"}' });
  });
});

describe("memory metadata limits", () => {
  it("accepts a one-line gist of at most 200 characters", () => {
    expect(zMemoryMeta.safeParse({ gist: "a".repeat(200) }).success).toBe(true);
    expect(zMemoryMeta.safeParse({ gist: "a".repeat(201) }).success).toBe(false);
    expect(zMemoryMeta.safeParse({ gist: "two\nlines" }).success).toBe(false);
    expect(zMemoryMeta.safeParse({ gist: "  " }).success).toBe(false);
  });

  it("counts characters, not bytes, for the gist", () => {
    expect(zMemoryMeta.safeParse({ gist: "é".repeat(200) }).success).toBe(true);
  });

  it("limits kind, entities and supersedes", () => {
    expect(zMemoryMeta.safeParse({ kind: "state" }).success).toBe(true);
    expect(zMemoryMeta.safeParse({ kind: "opinion" }).success).toBe(false);
    expect(zMemoryMeta.safeParse({ entities: Array.from({ length: 10 }, (_, i) => `e${i}`) }).success).toBe(true);
    expect(zMemoryMeta.safeParse({ entities: Array.from({ length: 11 }, (_, i) => `e${i}`) }).success).toBe(false);
    expect(zMemoryMeta.safeParse({ entities: ["a".repeat(65)] }).success).toBe(false);
    expect(zMemoryMeta.safeParse({ supersedes: "7" }).success).toBe(true);
    expect(zMemoryMeta.safeParse({ supersedes: "abc" }).success).toBe(false);
  });
});
