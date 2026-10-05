import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBridgeApi } from "./bridge";

const OWNER = "0x00000000000000000000000000000000000000A1";

describe("resuming a saved session", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_BRIDGE_URL = "http://bridge.test";
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends the saved token, remembers the owner, and forgets both on sign-out", async () => {
    const calls: { url: string; auth: string | null }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, auth: new Headers(init.headers).get("Authorization") });
      return new Response(JSON.stringify([]), { status: 200 });
    });
    const api = createBridgeApi();
    expect(api.owner()).toBeUndefined();
    expect(() => api.agents.list()).toThrow("Sign in first.");

    api.resume({ owner: OWNER, userToken: "saved-token", expiresAt: 2_000 });
    expect(api.owner()).toBe(OWNER);
    await api.agents.list();
    expect(calls).toEqual([{ url: "http://bridge.test/v1/agents", auth: "Bearer saved-token" }]);

    await api.auth.signOut({ owner: OWNER, userToken: "saved-token", expiresAt: 2_000 });
    expect(api.owner()).toBeUndefined();
    expect(() => api.agents.list()).toThrow("Sign in first.");
  });
});
