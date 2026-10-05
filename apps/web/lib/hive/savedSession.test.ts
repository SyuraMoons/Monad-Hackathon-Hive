import { describe, expect, it } from "vitest";
import { clearSavedSession, loadSavedSession, saveSession } from "./savedSession";

const session = { owner: "0x00000000000000000000000000000000000000A1" as const, userToken: "tok", expiresAt: 2_000, credentialId: "cred" };

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v), removeItem: (k: string) => void delete data[k] };
}

describe("saved session", () => {
  it("round-trips a live session", () => {
    const store = memory();
    saveSession(session, store);
    expect(loadSavedSession(1_000, store)).toEqual(session);
  });

  it("drops and clears an expired session", () => {
    const store = memory();
    saveSession(session, store);
    expect(loadSavedSession(2_000, store)).toBeNull(); // equal means expired
    expect(store.data["hive:session"]).toBeUndefined();
  });

  it("returns null for malformed or wrong-shape values and clears them", () => {
    for (const bad of ["{nope", JSON.stringify({ owner: "x" }), JSON.stringify({ ...session, userToken: "" })]) {
      const store = memory({ "hive:session": bad });
      expect(loadSavedSession(1_000, store)).toBeNull();
      expect(store.data["hive:session"]).toBeUndefined();
    }
  });

  it("returns null when nothing is saved or storage is unavailable", () => {
    expect(loadSavedSession(1_000, memory())).toBeNull();
    expect(loadSavedSession(1_000, null)).toBeNull();
  });

  it("does not throw when storage throws", () => {
    const boom = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("full"); }, removeItem: () => { throw new Error("denied"); } };
    expect(() => saveSession(session, boom)).not.toThrow();
    expect(loadSavedSession(1_000, boom)).toBeNull();
    expect(() => clearSavedSession(boom)).not.toThrow();
  });
});
