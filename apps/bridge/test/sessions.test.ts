import type { Hex } from "@hive/shared";
import { describe, expect, it } from "vitest";
import { SessionStore } from "../src/sessions.js";

const KEY = ("0x" + "33".repeat(32)) as Hex;
const session = (agentId: bigint, owner = "0xAA", expiresAt = 1000) => ({ agentId, name: "a", owner, encryptionKey: KEY, agentPrivateKey: KEY, expiresAt });

describe("a session's cache closes when the session ends", () => {
  it("on delete", () => {
    const store = new SessionStore(() => 10);
    store.put(session(1n));
    const docs = store.get(1n)!.docs;
    store.delete(1n);
    expect(docs.isClosed).toBe(true);
  });

  it("on sign-out of the owner, for every agent of that owner and no other", () => {
    const store = new SessionStore(() => 10);
    store.put(session(1n, "0xAA"));
    store.put(session(2n, "0xaa"));
    store.put(session(3n, "0xBB"));
    const [a, b, c] = [1n, 2n, 3n].map((id) => store.get(id)!.docs);
    store.deleteByOwner("0xAA");
    expect([a!.isClosed, b!.isClosed, c!.isClosed]).toEqual([true, true, false]);
  });

  it("on expiry", () => {
    let now = 10;
    const store = new SessionStore(() => now);
    store.put(session(1n, "0xAA", 100));
    const docs = store.get(1n)!.docs;
    now = 100;
    expect(store.get(1n)).toBeUndefined();
    expect(docs.isClosed).toBe(true);
  });

  it("when the agent is authorized again: the old cache closes, the new one is open", () => {
    const store = new SessionStore(() => 10);
    store.put(session(1n));
    const old = store.get(1n)!.docs;
    store.put(session(1n));
    expect(old.isClosed).toBe(true);
    expect(store.get(1n)!.docs.isClosed).toBe(false);
  });
});
