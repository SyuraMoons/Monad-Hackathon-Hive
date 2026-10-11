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

describe("signing out", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_BRIDGE_URL = "http://bridge.test";
  });
  afterEach(() => vi.unstubAllGlobals());

  const session = { owner: OWNER, userToken: "saved-token", expiresAt: 2_000 } as const;
  const status = (agentId: string, connected: boolean) => ({ agentId, name: `a${agentId}`, agentType: "claude", connected, lastCallAt: connected ? 1 : null, tokenExpiresAt: null });

  it("ends every session with one call, with the user token", async () => {
    const calls: { method: string; url: string; auth: string | null }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ method: init.method!, url, auth: new Headers(init.headers).get("Authorization") });
      return new Response(null, { status: 204 });
    });
    await createBridgeApi().auth.signOut(session);
    expect(calls).toEqual([{ method: "DELETE", url: "http://bridge.test/v1/sessions", auth: "Bearer saved-token" }]);
  });

  it("on a bridge without that route, disconnects every agent, the ones that never called a tool too", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push(`${init.method} ${url.replace("http://bridge.test", "")}`);
      if (url.endsWith("/v1/sessions")) return new Response("Not found", { status: 404 });
      if (url.endsWith("/v1/agents")) return new Response(JSON.stringify([status("1", true), status("2", false)]), { status: 200 });
      return new Response(null, { status: 204 });
    });
    await createBridgeApi().auth.signOut(session);
    expect(calls).toEqual(["DELETE /v1/sessions", "GET /v1/agents", "DELETE /v1/agents/1/session", "DELETE /v1/agents/2/session"]);
  });

  it("forgets the token and owner even when the bridge is unreachable", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    const api = createBridgeApi();
    api.resume(session);
    await expect(api.auth.signOut(session)).rejects.toBeDefined();
    expect(api.owner()).toBeUndefined();
    expect(() => api.agents.list()).toThrow("Sign in first.");
  });
});

describe("oauth.approve", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_BRIDGE_URL = "http://bridge.test";
  });
  afterEach(() => vi.unstubAllGlobals());

  const request = {
    response_type: "code" as const,
    client_id: "c",
    redirect_uri: "https://claude.ai/api/mcp/auth_callback",
    code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    code_challenge_method: "S256" as const,
    state: "xyz",
  };

  it("sends the agent id as a decimal string with the user token, and returns where to go", async () => {
    let sent: { url: string; auth: string | null; body: unknown } | undefined;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      sent = { url, auth: new Headers(init.headers).get("Authorization"), body: JSON.parse(init.body as string) };
      return new Response(JSON.stringify({ redirectTo: "https://claude.ai/api/mcp/auth_callback?code=abc&state=xyz" }), { status: 200 });
    });
    const api = createBridgeApi();
    api.resume({ owner: OWNER, userToken: "saved-token", expiresAt: 2_000 });
    const out = await api.oauth.approve({ request, decision: "allow", agentId: BigInt(7) });
    expect(out.redirectTo).toContain("code=abc");
    expect(sent).toEqual({ url: "http://bridge.test/v1/oauth/approve", auth: "Bearer saved-token", body: { request, decision: "allow", agentId: "7" } });
  });

  it("needs a signed-in owner", () => {
    expect(() => createBridgeApi().oauth.approve({ request, decision: "deny" })).toThrow("Sign in first.");
  });
});
