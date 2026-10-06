import { describe, expect, it } from "vitest";
import { loadEdgeNotes, saveEdgeNote } from "./edgeNotes";

const OWNER = "0x6AC6951B0a53d7a059A121494691A84b5403dF5A";
const TX = `0x${"ab".repeat(32)}`;

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v), data };
}

describe("edge notes", () => {
  it("keeps notes per owner, whatever the address casing", () => {
    const store = memory();
    saveEdgeNote(OWNER, "1", { topic: "brain", addedTx: TX }, store);
    expect(loadEdgeNotes(OWNER.toLowerCase(), store)).toEqual({ "1": { topic: "brain", addedTx: TX } });
    expect(loadEdgeNotes("0x00000000000000000000000000000000000000b2", store)).toEqual({});
  });

  it("adds to the notes already there", () => {
    const store = memory();
    saveEdgeNote(OWNER, "1", { topic: "brain", addedTx: TX }, store);
    saveEdgeNote(OWNER, "2", { topic: "work", addedTx: TX }, store);
    expect(Object.keys(loadEdgeNotes(OWNER, store))).toEqual(["1", "2"]);
  });

  it("ignores stored data that is not valid", () => {
    const key = `hive:edges:${OWNER.toLowerCase()}`;
    expect(loadEdgeNotes(OWNER, memory({ [key]: "not json" }))).toEqual({});
    expect(loadEdgeNotes(OWNER, memory({ [key]: JSON.stringify({ "1": { topic: "Bad Topic", addedTx: TX } }) }))).toEqual({});
  });

  it("works with no storage and a failing one", () => {
    expect(loadEdgeNotes(OWNER, null)).toEqual({});
    expect(() => saveEdgeNote(OWNER, "1", { topic: "a", addedTx: TX }, { getItem: () => null, setItem: () => { throw new Error("quota"); } })).not.toThrow();
  });
});
