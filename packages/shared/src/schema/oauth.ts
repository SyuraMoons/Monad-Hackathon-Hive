import { z } from "zod";
import { zAgentId } from "../ids.js";

// OAuth 2.1 for claude.ai, Desktop and mobile connectors. The bridge is its own authorization server (ADR-019).
// /oauth/* routes speak RFC 6749 shapes; only the web consent page talks to /v1/oauth/approve.

/** PKCE S256 challenge: base64url of a SHA-256 digest, 43 characters. */
const zCodeChallenge = z.string().regex(/^[A-Za-z0-9_-]{43,128}$/, "expected a PKCE S256 code challenge");

/** The query of GET /oauth/authorize, which the bridge forwards to the web consent page unchanged. */
export const zOAuthAuthorizeParams = z.object({
  response_type: z.literal("code"),
  client_id: z.string().min(1).max(2048),
  redirect_uri: z.url().max(512),
  code_challenge: zCodeChallenge,
  code_challenge_method: z.literal("S256"),
  state: z.string().max(512).optional(),
  scope: z.string().max(256).optional(),
  resource: z.string().max(512).optional(),
});

/** What the consent page sends once the owner picked an agent (or refused). `agentId` is required for `allow`. */
export const zOAuthApproveBody = z.object({
  request: zOAuthAuthorizeParams,
  decision: z.enum(["allow", "deny"]),
  agentId: zAgentId.optional(),
});
export const zOAuthApproveResponse = z.object({ redirectTo: z.url() });

export type OAuthAuthorizeParams = z.infer<typeof zOAuthAuthorizeParams>;
export type OAuthApproveBody = z.input<typeof zOAuthApproveBody>;
export type OAuthApproveResponse = z.infer<typeof zOAuthApproveResponse>;
