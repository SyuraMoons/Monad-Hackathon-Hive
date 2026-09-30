import type {
  Address,
  AgentId,
  AgentStatus,
  AgentType,
  AuditEvent,
  AuthorizeResponse,
  ContentHash,
  EdgeId,
  GraphSnapshot,
  HealthResponse,
  Hex,
  HiveError,
  HiveEvent,
  Provenance,
  Topic,
  TxHash,
  UnixSeconds,
} from "@hive/shared";

export type HiveMode = "mock" | "live";

export type Session = { owner: Address; userToken: string; expiresAt: UnixSeconds };

export type TxResult<T extends object = object> =
  | ({ status: "confirmed"; txHash: TxHash; explorerUrl: string } & T)
  | { status: "failed"; error: HiveError };

/** Returned as soon as the userOp is sent, so the UI can draw it as pending (golden rule 6). */
export type TxHandle<T extends object = object> = { status: "pending"; wait(): Promise<TxResult<T>> };

export type BridgeStatus = "connecting" | "open" | "reconnecting" | "offline";

/**
 * The only way screens reach the backend. `mock/` and `live/` implement it with the same signatures,
 * and both validate every inbound payload with the zod schemas from @hive/shared.
 */
export interface HiveClient {
  readonly mode: HiveMode;
  status: {
    /** GET /health: network status dots in the canvas sidebar. */
    health(): Promise<HealthResponse>;
  };
  auth: {
    /** POST /v1/auth/challenge */
    challenge(owner: Address): Promise<{ nonce: string; expiresAt: UnixSeconds }>;
    /** POST /v1/auth/verify. `signature` is the owner's EIP-191 signature of `authMessage(owner, nonce)`. */
    verify(body: { owner: Address; nonce: string; signature: Hex }): Promise<Session>;
    signOut(session: Session): Promise<void>;
  };
  agents: {
    list(): Promise<AgentStatus[]>;
    /** POST /v1/agents/:id/authorize. The bridge checks address(agentPrivateKey) == agents(id).agentKey. */
    authorize(agentId: AgentId, body: { agentPrivateKey: Hex; encryptionKey: Hex }): Promise<AuthorizeResponse>;
    disconnect(agentId: AgentId): Promise<void>;
  };
  graph: {
    load(owner: Address): Promise<GraphSnapshot>;
    auditEvents(owner: Address): Promise<AuditEvent[]>;
    provenance(contentHash: ContentHash): Promise<Provenance | null>;
  };
  events: {
    /** Bridge SSE. Returns an unsubscribe function. */
    subscribe(onEvent: (event: HiveEvent) => void, onStatus?: (status: BridgeStatus) => void): () => void;
  };
  memory: {
    /** Fetches the ciphertext and decrypts it on this device (rules O4). */
    preview(contentHash: ContentHash): Promise<string>;
  };
  tx: {
    /** AgentRegistry.register(name, agentType, agentKey) as an owner userOp (rules O1). */
    registerAgent(input: { name: string; agentType: AgentType; agentKey: Address }): TxHandle<{ agentId: AgentId }>;
    addEdge(input: { from: AgentId; to: AgentId; topic: Topic; expiresAt: UnixSeconds }): TxHandle<{ edgeId: EdgeId }>;
    removeEdge(edgeId: EdgeId): TxHandle;
  };
}
