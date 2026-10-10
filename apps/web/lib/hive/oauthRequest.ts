import { zOAuthAuthorizeParams, type OAuthAuthorizeParams } from "@hive/shared";

export type ConsentRequest = { request: OAuthAuthorizeParams; who: string };

const LOOPBACK = new Set(["localhost", "127.0.0.1"]);

/** Who the owner is about to hand an agent to, from the redirect URI the bridge already validated. */
export function requesterName(redirectUri: string): string {
  const { hostname } = new URL(redirectUri);
  return LOOPBACK.has(hostname) ? "Claude Code on this computer" : hostname === "claude.ai" ? "Claude (claude.ai, Claude Desktop or the mobile app)" : hostname;
}

/** The query the bridge's GET /oauth/authorize forwarded here. Anything malformed means this page was not opened by the bridge. */
export function parseConsentRequest(search: URLSearchParams): ConsentRequest | undefined {
  const parsed = zOAuthAuthorizeParams.safeParse(Object.fromEntries(search));
  return parsed.success ? { request: parsed.data, who: requesterName(parsed.data.redirect_uri) } : undefined;
}
