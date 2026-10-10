import { describe, expect, it } from "vitest";
import { parseConsentRequest, requesterName } from "./oauthRequest";

const base = {
  response_type: "code",
  client_id: "c",
  redirect_uri: "https://claude.ai/api/mcp/auth_callback",
  code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  code_challenge_method: "S256",
  state: "xyz",
};
const query = (over: Record<string, string> = {}) => new URLSearchParams({ ...base, ...over });

describe("consent request", () => {
  it("reads what the bridge forwarded and names the requester", () => {
    const out = parseConsentRequest(query());
    expect(out?.request.state).toBe("xyz");
    expect(out?.who).toContain("claude.ai");
  });

  it("refuses a page opened without the bridge's parameters", () => {
    expect(parseConsentRequest(new URLSearchParams())).toBeUndefined();
    expect(parseConsentRequest(query({ code_challenge_method: "plain" }))).toBeUndefined();
    expect(parseConsentRequest(query({ redirect_uri: "not a url" }))).toBeUndefined();
  });

  it("describes loopback as Claude Code and shows any other host as it is", () => {
    expect(requesterName("http://localhost:3118/callback")).toBe("Claude Code on this computer");
    expect(requesterName("http://127.0.0.1:5000/callback")).toBe("Claude Code on this computer");
    expect(requesterName("https://other.example/cb")).toBe("other.example");
  });
});
