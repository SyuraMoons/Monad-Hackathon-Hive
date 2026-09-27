import type { Address, Hex } from "viem";

// Struct shapes mirror packages/contracts/src/interfaces/*.sol.
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
