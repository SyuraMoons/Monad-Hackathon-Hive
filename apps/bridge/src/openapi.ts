import {
  ERROR_CODES, MCP_TOOLS, zAgentsResponse, zAuthChallengeBody, zAuthChallengeResponse, zAuthVerifyBody, zAuthVerifyResponse, zAuthorizeBody,
  zAuthorizeResponse, zErrorEnvelope, zHealthResponse, zHiveEvent, zMemoryResponse, zPutVaultBody, zVaultResponse,
} from "@hive/shared";
import { z } from "zod";

type Json = Record<string, unknown>;

/** The wire format is the schema's input side: uint256 as a decimal string, addresses as given. */
const schemaOf = (s: z.ZodType): Json => {
  const { $schema: _drop, ...rest } = z.toJSONSchema(s, { io: "input", unrepresentable: "any" }) as Json;
  return rest;
};

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (name: string) => ({ "application/json": { schema: ref(name) } });
const errorResponse = (description: string) => ({ description, content: json("ErrorEnvelope") });

const ERRORS = {
  400: errorResponse("INVALID_INPUT: the path, query or body did not match the schema."),
  401: errorResponse("UNAUTHORIZED or SESSION_EXPIRED: missing, invalid or expired token."),
  403: errorResponse("FORBIDDEN: the resource belongs to another owner."),
  404: errorResponse("NOT_FOUND."),
  502: errorResponse("CHAIN_ERROR or STORAGE_ERROR: Monad or Supabase could not be reached."),
};
const pick = (...codes: (keyof typeof ERRORS)[]) => Object.fromEntries(codes.map((c) => [c, ERRORS[c]]));

const userAuth = [{ userToken: [] }];
const agentIdParam = { name: "id", in: "path", required: true, description: "Agent id: a uint256 as a decimal string.", schema: { type: "string", pattern: "^(0|[1-9]\\d*)$" } };
const contentHashParam = { name: "contentHash", in: "path", required: true, description: "keccak256(iv ‖ ciphertext) of the memory, as 32-byte hex.", schema: { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" } };
const credentialIdParam = { name: "credentialId", in: "path", required: true, description: "Mera passkey credential id (base64url).", schema: { type: "string", pattern: "^[A-Za-z0-9_-]{1,255}$" } };

const mcpToolList = Object.keys(MCP_TOOLS).map((n) => `\`${n}\``).join(", ");

export function buildOpenApi(version = "0.0.0"): Json {
  const schemas: Record<string, Json> = {
    ErrorEnvelope: schemaOf(zErrorEnvelope),
    HealthResponse: schemaOf(zHealthResponse),
    AuthChallengeBody: schemaOf(zAuthChallengeBody),
    AuthChallengeResponse: schemaOf(zAuthChallengeResponse),
    AuthVerifyBody: schemaOf(zAuthVerifyBody),
    AuthVerifyResponse: schemaOf(zAuthVerifyResponse),
    AgentsResponse: schemaOf(zAgentsResponse),
    AuthorizeBody: schemaOf(zAuthorizeBody),
    AuthorizeResponse: schemaOf(zAuthorizeResponse),
    MemoryResponse: schemaOf(zMemoryResponse),
    VaultResponse: schemaOf(zVaultResponse),
    PutVaultBody: schemaOf(zPutVaultBody),
    HiveEvent: schemaOf(zHiveEvent),
  };
  for (const [name, t] of Object.entries(MCP_TOOLS)) {
    schemas[`${name}.input`] = schemaOf(t.input);
    schemas[`${name}.output`] = schemaOf(t.output);
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Mindshare Bridge API",
      version,
      description: [
        "HTTP API of the bridge: sign-in, agent sessions, the encrypted vault, a live event stream and the MCP endpoint that AI clients call.",
        "",
        "Generated from the zod schemas in `@hive/shared`, so it follows the code. The product is Mindshare; the code still says Hive (ADR-008).",
        "",
        "- **Errors** are always `{ \"error\": { \"code\", \"message\" } }`. Messages are fixed strings and never contain request bodies, keys or memory content.",
        "- **uint256 values** (`agentId`, `slotId`) are decimal strings on the wire. **Timestamps** are unix seconds.",
        "- **Default deny:** any error while checking a permission returns no data.",
      ].join("\n"),
    },
    servers: [{ url: "/", description: "This bridge" }],
    tags: [
      { name: "System", description: "Liveness." },
      { name: "Auth", description: "Sign in with a wallet signature, get a user token." },
      { name: "Agents", description: "Owner-only. Authorize an agent, list agents, end a session." },
      { name: "Memory", description: "Owner-only read of your own encrypted memories. Ciphertext only: decrypt on your device." },
      { name: "Vault", description: "The Mera secret vault, stored as ciphertext." },
      { name: "Events", description: "Server-sent events for the canvas." },
      { name: "MCP", description: "The endpoint AI clients call, with an agent token." },
    ],
    paths: {
      "/health": {
        get: {
          tags: ["System"], operationId: "getHealth", summary: "Health and reachability",
          description: "Always 200 while the process is up. A failing probe is reported as `false`, not as an error.",
          responses: { 200: { description: "OK", content: json("HealthResponse") } },
        },
      },
      "/v1/auth/challenge": {
        post: {
          tags: ["Auth"], operationId: "authChallenge", summary: "Get a nonce to sign",
          requestBody: { required: true, content: json("AuthChallengeBody") },
          responses: { 200: { description: "A single-use nonce.", content: json("AuthChallengeResponse") }, ...pick(400) },
        },
      },
      "/v1/auth/verify": {
        post: {
          tags: ["Auth"], operationId: "authVerify", summary: "Exchange a signed nonce for a user token",
          description: "`signature` is an EIP-191 signature of `authMessage(owner, nonce)` from `@hive/shared`. Smart accounts (ERC-1271 / 6492) are accepted.",
          requestBody: { required: true, content: json("AuthVerifyBody") },
          responses: { 200: { description: "A user token for `/v1/*`.", content: json("AuthVerifyResponse") }, ...pick(400, 401) },
        },
      },
      "/v1/agents": {
        get: {
          tags: ["Agents"], operationId: "listAgents", summary: "List the owner's agents with connection status",
          security: userAuth,
          responses: { 200: { description: "Agents owned by the signed-in user.", content: json("AgentsResponse") }, ...pick(401, 502) },
        },
      },
      "/v1/agents/{id}/authorize": {
        post: {
          tags: ["Agents"], operationId: "authorizeAgent", summary: "Start an agent session and get its MCP token",
          description: "The owner hands over the agent's writer key and the encryption key. Both stay in bridge memory and are never echoed. The key must be the agent's registered writer. The gas top-up is best effort (ADR-006, ADR-007).",
          security: userAuth, parameters: [agentIdParam],
          requestBody: { required: true, content: json("AuthorizeBody") },
          responses: { 200: { description: "An agent token and the MCP URL to give to the AI client.", content: json("AuthorizeResponse") }, ...pick(400, 401, 403, 404, 502) },
        },
      },
      "/v1/agents/{id}/session": {
        delete: {
          tags: ["Agents"], operationId: "endAgentSession", summary: "End an agent session",
          description: "Removes the agent's keys from memory and stops its token working. Idempotent.",
          security: userAuth, parameters: [agentIdParam],
          responses: { 204: { description: "Session ended (or there was none)." }, ...pick(400, 401, 403) },
        },
      },
      "/v1/memory/{contentHash}": {
        get: {
          tags: ["Memory"], operationId: "getMemory", summary: "Fetch one of your own memories as ciphertext",
          description: "Returns base64 `ciphertext` (GCM tag appended), `iv` and the `keyId` that sealed it. The bridge never decrypts it for you: use the encryption key you hold. A memory that belongs to another owner is a 404, the same as one that does not exist. Not cached.",
          security: userAuth, parameters: [contentHashParam],
          responses: { 200: { description: "The sealed memory.", content: json("MemoryResponse") }, ...pick(400, 401, 404, 502) },
        },
      },
      "/v1/vaults/{credentialId}": {
        get: {
          tags: ["Vault"], operationId: "getVault", summary: "Fetch a vault by passkey credential id",
          description: "Public on purpose: a new device has no token before it can sign in. Returns ciphertext only, never the owner.",
          parameters: [credentialIdParam],
          responses: { 200: { description: "The vault ciphertext.", content: json("VaultResponse") }, ...pick(400, 404, 502) },
        },
        put: {
          tags: ["Vault"], operationId: "putVault", summary: "Create or replace a vault",
          security: userAuth, parameters: [credentialIdParam],
          requestBody: { required: true, content: json("PutVaultBody") },
          responses: { 201: { description: "Created." }, 204: { description: "Replaced." }, ...pick(400, 401, 403, 502) },
        },
      },
      "/v1/events": {
        get: {
          tags: ["Events"], operationId: "streamEvents", summary: "Live events for the signed-in owner (SSE)",
          description: "A `text/event-stream`. Each `data:` line is one `HiveEvent` JSON object. `EventSource` cannot send headers, so the user token goes in the query. Reconnect with `Last-Event-ID` to replay missed events. Payloads never carry plaintext. Swagger UI cannot show a stream; use `curl -N`.",
          security: [{ userTokenQuery: [] }],
          parameters: [{ name: "Last-Event-ID", in: "header", required: false, schema: { type: "string" } }],
          responses: { 200: { description: "The event stream.", content: { "text/event-stream": { schema: ref("HiveEvent") } } }, ...pick(401) },
        },
      },
      "/mcp": {
        post: {
          tags: ["MCP"], operationId: "mcp", summary: "MCP over streamable HTTP (JSON-RPC 2.0)",
          description: [
            "Stateless: one request, one JSON response. Use an MCP client (it sends `Accept: application/json, text/event-stream`). Other methods return 405.",
            "",
            `Tools: ${mcpToolList}. Their argument and result schemas are in \`components.schemas\` as \`<tool>.input\` and \`<tool>.output\`.`,
            "",
            "Identity comes from the agent token, never from an argument. Sharing is pull: the AI must call `hive_read_memory`. `hive_whoami.readableTopics` is planned and currently returns an empty list.",
          ].join("\n"),
          security: [{ agentToken: [] }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", description: "A JSON-RPC 2.0 request, for example `tools/call`.", additionalProperties: true } } } },
          responses: {
            200: { description: "A JSON-RPC 2.0 response.", content: { "application/json": { schema: { type: "object", additionalProperties: true } } } },
            ...pick(401),
            405: { description: "Not POST." },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        userToken: { type: "http", scheme: "bearer", bearerFormat: "JWT", description: "From `POST /v1/auth/verify`. Accepted on `/v1/*` only." },
        userTokenQuery: { type: "apiKey", in: "query", name: "token", description: "The same user token, for `EventSource`." },
        agentToken: { type: "http", scheme: "bearer", bearerFormat: "JWT", description: "From `POST /v1/agents/{id}/authorize`. Accepted on `/mcp` only, and only while the session is live." },
      },
      schemas: { ...schemas, ErrorCode: { type: "string", enum: [...ERROR_CODES] } },
    },
  };
}
