import { z } from "zod";
import { zAddress, zAgentId, zAgentType, zBase64, zHex, zUnixSeconds } from "../ids.js";

// Bridge HTTP routes (rules §5.1). Bodies are what the client sends, responses what the bridge returns.

export const zHealthResponse = z.object({
  ok: z.boolean(),
  chainId: z.number().int(),
  rpcReachable: z.boolean(),
  supabaseReachable: z.boolean(),
  activeSessions: z.number().int().nonnegative(),
  version: z.string(),
});

export const zAuthChallengeBody = z.object({ owner: zAddress });
export const zAuthChallengeResponse = z.object({ nonce: z.string().min(1), expiresAt: zUnixSeconds });

/**
 * The exact text the owner signs for /v1/auth/verify (EIP-191). The bridge rebuilds it from
 * `{ owner, nonce }` and checks it with viem `verifyMessage`, so both sides must use this function.
 */
export const authMessage = (owner: string, nonce: string) => `Sign in to Hive\n\nOwner: ${owner}\nNonce: ${nonce}`;

export const zAuthVerifyBody = z.object({ owner: zAddress, nonce: z.string().min(1), signature: zHex });
export const zAuthVerifyResponse = z.object({ userToken: z.string().min(1), expiresAt: zUnixSeconds });

export const zAgentStatus = z.object({
  agentId: zAgentId,
  name: z.string().min(1).max(64),
  agentType: zAgentType,
  connected: z.boolean(),
  lastCallAt: zUnixSeconds.nullable(),
  tokenExpiresAt: zUnixSeconds.nullable(),
});
export const zAgentsResponse = z.array(zAgentStatus);

const zPrivateKey = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "expected a 32-byte private key");

export const zAuthorizeBody = z.object({ agentPrivateKey: zPrivateKey, encryptionKey: zPrivateKey });
export const zAuthorizeResponse = z.object({ agentToken: z.string().min(1), expiresAt: zUnixSeconds, mcpUrl: z.url() });

export const zMemoryResponse = z.object({ ciphertext: zBase64, iv: zBase64, keyId: z.string().min(1) });

export type HealthResponse = z.infer<typeof zHealthResponse>;
export type AuthChallengeBody = z.input<typeof zAuthChallengeBody>;
export type AuthChallengeResponse = z.infer<typeof zAuthChallengeResponse>;
export type AuthVerifyBody = z.input<typeof zAuthVerifyBody>;
export type AuthVerifyResponse = z.infer<typeof zAuthVerifyResponse>;
export type AgentStatus = z.infer<typeof zAgentStatus>;
export type AuthorizeBody = z.input<typeof zAuthorizeBody>;
export type AuthorizeResponse = z.infer<typeof zAuthorizeResponse>;
export type MemoryResponse = z.infer<typeof zMemoryResponse>;
