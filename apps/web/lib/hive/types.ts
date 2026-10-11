import type {
  Address,
  AgentId,
  AgentStatus,
  AgentType,
  AuditEvent,
  OwnerStats,
  AuthorizeResponse,
  ContentHash,
  EdgeId,
  Agent as ChainAgent,
  Edge as ChainEdge,
  HealthResponse,
  Hex,
  HiveError,
  HiveEvent,
  OAuthApproveResponse,
  OAuthAuthorizeParams,
  Provenance,
  SlotId,
  Topic,
  TxHash,
  UnixSeconds,
} from "@hive/shared";
import type { MemoryView } from "./memoryView";

export type HiveMode = "mock" | "live";

export type Session = { owner: Address; userToken: string; expiresAt: UnixSeconds };

export type TxResult<T extends object = object> =
  | ({ status: "confirmed"; txHash: TxHash; explorerUrl: string } & T)
  | { status: "failed"; error: HiveError };

/** Returned as soon as the userOp is sent, so the UI can draw it as pending (golden rule 6). */
export type TxHandle<T extends object = object> = { status: "pending"; wait(): Promise<TxResult<T>> };

/** One past write of an agent, as the chain keeps it: hashes and topics, never content. */
export type MemoryHistoryRow = { slotId: SlotId; topic: Topic; contentHash: ContentHash; writtenAt: UnixSeconds };

/** An edge as read from the chain. `addedTx` is null when this browser did not sign it: the chain keeps no transaction hash. */
export type EdgeRow = Omit<ChainEdge, "addedTx"> & { addedTx: TxHash | null };

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
    /**
     * Only for the ADR-002 fallback (the owner EOA pays gas): the balance, e.g. "0.001 MON", when it may not
     * cover a signature. With Pimlico-sponsored userOps (rules A5) this is always null.
     */
    lowBalance(): Promise<string | null>;
    /** The signed-in owner's MON balance for the wallet menu. `mon` is already formatted ("0.1234"); `low` means it may not cover a few transactions. */
    balance(): Promise<{ mon: string; low: boolean }>;
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
  oauth: {
    /** POST /v1/oauth/approve: the owner's answer to a claude.ai connector request. Returns where to send the browser next (the agent must already be authorized). */
    approve(body: { request: OAuthAuthorizeParams; decision: "allow" | "deny"; agentId?: AgentId }): Promise<OAuthApproveResponse>;
  };
  graph: {
    load(owner: Address): Promise<{ agents: ChainAgent[]; edges: EdgeRow[] }>;
    auditEvents(owner: Address): Promise<AuditEvent[]>;
    provenance(contentHash: ContentHash): Promise<Provenance | null>;
    /** Counters for the Audit strip. All zero for an owner the indexer has not seen. */
    ownerStats(owner: Address): Promise<OwnerStats>;
  };
  events: {
    /** Bridge SSE. Returns an unsubscribe function. */
    subscribe(onEvent: (event: HiveEvent) => void, onStatus?: (status: BridgeStatus) => void): () => void;
  };
  memory: {
    /** The agent's past writes from the chain, newest first (at most 50). Content stays encrypted: this is hashes and topics. */
    history(agentId: AgentId): Promise<MemoryHistoryRow[]>;
    /** Fetches the ciphertext and decrypts it on this device (rules O4). Rejects with `LockedError` while the keys are locked. */
    preview(contentHash: ContentHash): Promise<MemoryView>;
  };
  tx: {
    /** AgentRegistry.register(name, agentType, agentKey) as an owner userOp (rules O1). */
    registerAgent(input: { name: string; agentType: AgentType; agentKey: Address }): TxHandle<{ agentId: AgentId }>;
    addEdge(input: { from: AgentId; to: AgentId; topic: Topic; expiresAt: UnixSeconds }): TxHandle<{ edgeId: EdgeId }>;
    removeEdge(edgeId: EdgeId): TxHandle;
  };
}

// Contract struct mirrors for the direct read layer (lib/hive/hooks.ts).
export interface Agent {
  owner: Address;
  name: string;
  agentType: string;
  pubKey: Hex;
  writer: Address;
  registeredAt: bigint;
}

export interface Edge {
  id: bigint;
  from: bigint;
  to: bigint;
  topic: Hex;
  expiresAt: bigint;
  active: boolean;
}

export interface Slot {
  id: bigint;
  agentId: bigint;
  contentHash: Hex;
  topic: string;
  writtenAt: bigint;
}
