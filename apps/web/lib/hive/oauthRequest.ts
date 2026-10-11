import { zOAuthAuthorizeParams, type OAuthAuthorizeParams } from "@hive/shared";

export type ConsentRequest = { request: OAuthAuthorizeParams; who: string; type: "claude" | "gpt" };

const LOOPBACK = new Set(["localhost", "127.0.0.1"]);

/** Who the owner is about to hand an agent to, from the redirect URI the bridge already validated. */
export function requesterName(redirectUri: string): string {
  const { hostname } = new URL(redirectUri);
  if (LOOPBACK.has(hostname)) return "Claude Code on this computer";
  if (hostname === "claude.ai") return "Claude (claude.ai, Claude Desktop or the mobile app)";
  if (hostname === "chatgpt.com") return "ChatGPT (chatgpt.com, the desktop or mobile app)";
  return hostname;
}

/** Which agent type the requester is: ChatGPT connects GPT agents, everything else (claude.ai, Claude Code) connects Claude agents. */
export function requesterType(redirectUri: string): "claude" | "gpt" {
  return new URL(redirectUri).hostname === "chatgpt.com" ? "gpt" : "claude";
}

/** The query the bridge's GET /oauth/authorize forwarded here. Anything malformed means this page was not opened by the bridge. */
export function parseConsentRequest(search: URLSearchParams): ConsentRequest | undefined {
  const parsed = zOAuthAuthorizeParams.safeParse(Object.fromEntries(search));
  return parsed.success ? { request: parsed.data, who: requesterName(parsed.data.redirect_uri), type: requesterType(parsed.data.redirect_uri) } : undefined;
}
