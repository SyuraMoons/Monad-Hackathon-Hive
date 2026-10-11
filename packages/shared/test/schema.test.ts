import { describe, expect, it } from "vitest";
import {
  DEFAULT_TOPIC,
  authMessage,
  zAgentsResponse,
  zAuditEvent,
  zOwnerStats,
  zProvenance,
  zAuthChallengeBody,
  zAuthorizeBody,
  zAuthorizeResponse,
  zAuthVerifyBody,
  zGraphSnapshot,
  zSearchMemoryInput,
  zSearchMemoryOutput,
  zHealthResponse,
  zHiveEvent,
  zMemoryResponse,
  zOAuthApproveBody,
  zOAuthAuthorizeParams,
  zListMemoryInput,
  zListMemoryOutput,
  zReadMemoryInput,
  zReadMemoryOutput,
  zSaveSessionInput,
  zSaveSessionOutput,
  zWhoamiInput,
  zWhoamiOutput,
  zWriteMemoryInput,
  zWriteMemoryOutput,
} from "../src/index.js";

const OWNER = "0x7f3a00000000000000000000000000000000c21e";
const KEY = "0x" + "11".repeat(32);
const HASH = "0x" + "4f1c".repeat(16);
const TX = "0x" + "9a2e".repeat(16);

describe("api", () => {
  it("builds the sign-in message the bridge verifies", () => {
    expect(authMessage(OWNER, "n0nce")).toBe(`Sign in to Hive\n\nOwner: ${OWNER}\nNonce: n0nce`);
  });

  it("accepts valid bodies and responses", () => {
    expect(zHealthResponse.safeParse({ ok: true, chainId: 10143, rpcReachable: true, supabaseReachable: true, activeSessions: 2, version: "0.1.0" }).success).toBe(true);
    expect(zAuthChallengeBody.safeParse({ owner: OWNER }).success).toBe(true);
    expect(zAuthVerifyBody.safeParse({ owner: OWNER, nonce: "n", signature: "0xabcd" }).success).toBe(true);
    const agents = zAgentsResponse.parse([{ agentId: "1", name: "Claude", agentType: "claude", connected: true, lastCallAt: 1790000000, tokenExpiresAt: null }]);
    expect(agents[0].agentId).toBe(1n);
    expect(zAgentsResponse.parse([{ agentId: "2", name: "DeepSeek", agentType: "deepseek", connected: false, lastCallAt: null, tokenExpiresAt: null }])[0].agentType).toBe("deepseek");
    expect(zAuthorizeBody.safeParse({ agentPrivateKey: KEY, encryptionKey: KEY }).success).toBe(true);
    expect(zAuthorizeResponse.safeParse({ agentToken: "t", expiresAt: 1, mcpUrl: "http://localhost:4000/mcp" }).success).toBe(true);
    expect(zMemoryResponse.safeParse({ ciphertext: "AAEC", iv: "AAEC", keyId: "k1" }).success).toBe(true);
  });

  it("rejects invalid payloads", () => {
    expect(zAuthChallengeBody.safeParse({ owner: "me" }).success).toBe(false);
    expect(zAuthVerifyBody.safeParse({ owner: OWNER, nonce: "", signature: "0xabcd" }).success).toBe(false);
    expect(zAgentsResponse.safeParse([{ agentId: 1, name: "Claude", agentType: "claude", connected: true, lastCallAt: null, tokenExpiresAt: null }]).success).toBe(false);
    expect(zAgentsResponse.safeParse([{ agentId: "1", name: "Claude", agentType: "cursor", connected: true, lastCallAt: null, tokenExpiresAt: null }]).success).toBe(false);
    expect(zAuthorizeBody.safeParse({ agentPrivateKey: "0x12", encryptionKey: KEY }).success).toBe(false);
    expect(zAuthorizeResponse.safeParse({ agentToken: "t", expiresAt: 1, mcpUrl: "not a url" }).success).toBe(false);
    expect(zMemoryResponse.safeParse({ ciphertext: "not base64!", iv: "AAEC", keyId: "k1" }).success).toBe(false);
  });
});

describe("events", () => {
  const written = {
    id: "evt-1",
    type: "memory.written",
    at: 1790000000,
    data: { slotId: "7", agentId: "1", topic: "work", contentHash: HASH, txHash: TX, propagatedTo: ["2"] },
  };

  it("parses each event type", () => {
    const e = zHiveEvent.parse(written);
    expect(e.type).toBe("memory.written");
    if (e.type === "memory.written") expect(e.data.propagatedTo).toEqual([2n]);
    for (const ok of [
      { id: "a", type: "agent.connected", at: 1, data: { agentId: "1" } },
      { id: "b", type: "agent.disconnected", at: 1, data: { agentId: "1" } },
      { id: "c", type: "memory.read", at: 1, data: { readerAgentId: "2", fromAgentIds: ["1"], count: 1 } },
      { id: "d", type: "session.expiring", at: 1, data: { agentId: "1", expiresAt: 2 } },
    ]) expect(zHiveEvent.safeParse(ok).success, ok.type).toBe(true);
  });

  it("rejects unknown types, bad topics and bad timestamps", () => {
    expect(zHiveEvent.safeParse({ ...written, type: "memory.deleted" }).success).toBe(false);
    expect(zHiveEvent.safeParse({ ...written, data: { ...written.data, topic: "Work" } }).success).toBe(false);
    expect(zHiveEvent.safeParse({ ...written, at: "now" }).success).toBe(false);
  });
});

describe("mcp", () => {
  it("validates hive_write_memory", () => {
    expect(zWriteMemoryInput.safeParse({ topic: "work", content: "Deadline Oct 13" }).success).toBe(true);
    expect(zWriteMemoryInput.safeParse({ topic: "work", content: "é".repeat(2049) }).success).toBe(false); // 4098 bytes
    expect(zWriteMemoryInput.safeParse({ topic: "work", content: "" }).success).toBe(false);
    expect(zWriteMemoryOutput.safeParse({ slotId: "1", contentHash: HASH, txHash: TX, propagatedTo: [] }).success).toBe(true);
  });

  it("validates hive_save_session", () => {
    expect(zSaveSessionInput.safeParse({ summary: "Decided on Postgres" }).success).toBe(true);
    expect(zSaveSessionInput.safeParse({ summary: "ok", topic: "team-brain" }).success).toBe(true);
    expect(zSaveSessionInput.safeParse({ summary: "é".repeat(2049) }).success).toBe(false); // 4098 bytes
    expect(zSaveSessionInput.safeParse({ summary: "ok", topic: "Bad Topic" }).success).toBe(false);
    expect(zSaveSessionOutput.safeParse({ slotId: "1", contentHash: HASH, txHash: TX, propagatedTo: [], topic: DEFAULT_TOPIC }).success).toBe(true);
  });

  it("validates hive_read_memory", () => {
    expect(zReadMemoryInput.safeParse({}).success).toBe(true);
    expect(zReadMemoryInput.safeParse({ since: -1 }).success).toBe(false);
    expect(zReadMemoryOutput.safeParse({ memories: [{ slotId: "1", fromAgentId: "1", fromName: "Claude", topic: "work", content: "x", writtenAt: 1 }] }).success).toBe(true);
    expect(zReadMemoryOutput.safeParse({ memories: [{ slotId: "1", fromAgentId: "1", topic: "work", content: "x", writtenAt: 1 }] }).success).toBe(false);
  });

  it("validates the paging and list shapes", () => {
    expect(zReadMemoryInput.safeParse({ slotIds: ["4"], limit: 5 }).success).toBe(true);
    expect(zReadMemoryInput.safeParse({ limit: 0 }).success).toBe(false);
    expect(zReadMemoryInput.safeParse({ limit: 51 }).success).toBe(false);
    expect(zReadMemoryInput.safeParse({ slotIds: [] }).success).toBe(false);
    expect(zListMemoryInput.safeParse({ topic: "work", limit: 20 }).success).toBe(true);
    expect(zListMemoryOutput.safeParse({ memories: [{ slotId: "1", fromAgentId: "1", fromName: "Claude", topic: "work", writtenAt: 1, bytes: 3, preview: "abc" }], more: true }).success).toBe(true);
  });

  it("validates the structured write fields", () => {
    expect(zWriteMemoryInput.safeParse({ topic: "work", content: "x", gist: "g", kind: "fact", entities: ["hive"], supersedes: "3" }).success).toBe(true);
    expect(zWriteMemoryInput.safeParse({ topic: "work", content: "x", kind: "nope" }).success).toBe(false);
    expect(zSaveSessionInput.safeParse({ summary: "x", kind: "session", gist: "g" }).success).toBe(true);
  });

  it("validates delta, own-read and kind filters", () => {
    expect(zReadMemoryInput.safeParse({ cursor: "1700000000:12", mine: true, kind: "state", includeSuperseded: true }).success).toBe(true);
    expect(zReadMemoryInput.safeParse({ cursor: "12" }).success).toBe(false);
    expect(zListMemoryInput.safeParse({ cursor: "1:0" }).success).toBe(true);
    expect(zListMemoryInput.safeParse({ cursor: "1:01" }).success).toBe(false);
  });

  it("validates hive_search_memory", () => {
    expect(zSearchMemoryInput.safeParse({ query: "deploy url" }).success).toBe(true);
    expect(zSearchMemoryInput.safeParse({ query: "  " }).success).toBe(false);
    expect(zSearchMemoryInput.safeParse({ query: "x".repeat(501) }).success).toBe(false);
    expect(zSearchMemoryInput.safeParse({ query: "x", limit: 21 }).success).toBe(false);
    expect(zSearchMemoryInput.safeParse({ query: "x", agentId: "2" }).success).toBe(true); // stripped, identity comes from the token
    expect(zSearchMemoryOutput.safeParse({ memories: [{ slotId: "1", fromAgentId: "1", fromName: "Claude", topic: "work", writtenAt: 1, bytes: 3, preview: "abc", score: 1.2, matched: ["text"] }], mode: "lexical" }).success).toBe(true);
  });

  it("validates hive_whoami and refuses an agentId argument", () => {
    expect(zWhoamiInput.safeParse({}).success).toBe(true);
    expect(zWhoamiInput.safeParse({ agentId: "2" }).success).toBe(false); // identity comes from the token
    expect(zWhoamiOutput.safeParse({ agentId: "2", name: "GPT", owner: OWNER, tokenExpiresAt: 1, readableTopics: [{ fromAgentId: "1", topic: "work", expiresAt: 2 }] }).success).toBe(true);
  });
});

describe("graph", () => {
  it("validates an Envio graph snapshot", () => {
    const snap = {
      agents: [{ agentId: "1", owner: OWNER, agentKey: OWNER, name: "Claude", agentType: "claude", registeredAt: 1 }],
      edges: [{ edgeId: "1", from: "1", to: "2", topic: "work", expiresAt: 2, active: true, addedTx: TX, removedTx: null }],
    };
    expect(zGraphSnapshot.parse(snap).edges[0].edgeId).toBe(1n);
    expect(zGraphSnapshot.safeParse({ ...snap, edges: [{ ...snap.edges[0], edgeId: HASH }] }).success).toBe(false); // edge IDs are uint256 (A11)
  });

  it("validates audit events and provenance", () => {
    expect(zAuditEvent.safeParse({ kind: "edge.removed", at: 1, txHash: TX, edgeId: "3", from: "1", to: "2", topic: "work" }).success).toBe(true);
    expect(zAuditEvent.safeParse({ kind: "edge.removed", at: 1, txHash: TX, edgeId: "3", from: "1", to: "2" }).success).toBe(false);
    const slot = { slotId: "1", agentId: "1", contentHash: HASH, topic: "work", propagatedCount: 1, txHash: TX, writtenAt: 1 };
    expect(zProvenance.safeParse({ slot, propagations: [{ slotId: "1", from: "1", to: "2", contentHash: HASH, topic: "work", txHash: TX, at: 1 }] }).success).toBe(true);
    expect(zProvenance.safeParse({ slot: { ...slot, propagatedCount: -1 }, propagations: [] }).success).toBe(false);
  });
});

describe("owner stats", () => {
  const stats = { agents: 2, edgesAdded: 3, edgesRevoked: 1, memories: 4, propagations: 5, violations: 0 };
  it("accepts counters and rejects negatives or missing fields", () => {
    expect(zOwnerStats.safeParse(stats).success).toBe(true);
    expect(zOwnerStats.safeParse({ ...stats, violations: -1 }).success).toBe(false);
    expect(zOwnerStats.safeParse({ ...stats, agents: undefined }).success).toBe(false);
  });
});

describe("OAuth consent contract", () => {
  const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
  const params = { response_type: "code", client_id: "c", redirect_uri: "https://claude.ai/api/mcp/auth_callback", code_challenge: challenge, code_challenge_method: "S256" };

  it("accepts an S256 authorize request and refuses plain PKCE or a short challenge", () => {
    expect(zOAuthAuthorizeParams.safeParse(params).success).toBe(true);
    expect(zOAuthAuthorizeParams.safeParse({ ...params, code_challenge_method: "plain" }).success).toBe(false);
    expect(zOAuthAuthorizeParams.safeParse({ ...params, code_challenge: "abc" }).success).toBe(false);
    expect(zOAuthAuthorizeParams.safeParse({ ...params, response_type: "token" }).success).toBe(false);
  });

  it("reads the approved agent id as a bigint", () => {
    const body = zOAuthApproveBody.parse({ request: params, decision: "allow", agentId: "7" });
    expect(body.agentId).toBe(7n);
    expect(zOAuthApproveBody.safeParse({ request: params, decision: "maybe" }).success).toBe(false);
  });
});
