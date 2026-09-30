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
  auth: {
    /** Passkey (Mera PRF) → derive keys → challenge/verify with the bridge. */
    signIn(): Promise<Session>;
    signOut(session: Session): Promise<void>;
  };
  agents: {
    list(): Promise<AgentStatus[]>;
    authorize(agentId: AgentId): Promise<AuthorizeResponse>;
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
    registerAgent(input: { name: string; agentType: AgentType }): TxHandle<{ agentId: AgentId }>;
    addEdge(input: { from: AgentId; to: AgentId; topic: Topic; expiresAt: UnixSeconds }): TxHandle<{ edgeId: EdgeId }>;
    removeEdge(edgeId: EdgeId): TxHandle;
  };
}
