import type { Address } from "viem";
import { hiveDeployment } from "@hive/shared";

export interface HiveAddresses {
  agentRegistry: Address;
  knowledgeGraph: Address;
  memorySlots: Address;
  propagationEngine: Address;
}

function parseAddress(value: string | undefined, fallback: string): Address {
  return value && /^0x[0-9a-fA-F]{40}$/.test(value) ? (value as Address) : (fallback as Address);
}

// Defaults come from the committed Monad testnet deployment in @hive/shared.
// NEXT_PUBLIC_* (inlined by Next at build time) overrides them per-environment.
export const hiveAddresses: HiveAddresses = {
  agentRegistry: parseAddress(process.env.NEXT_PUBLIC_HIVE_AGENT_REGISTRY, hiveDeployment.agentRegistry),
  knowledgeGraph: parseAddress(process.env.NEXT_PUBLIC_HIVE_KNOWLEDGE_GRAPH, hiveDeployment.knowledgeGraph),
  memorySlots: parseAddress(process.env.NEXT_PUBLIC_HIVE_MEMORY_SLOTS, hiveDeployment.memorySlots),
  propagationEngine: parseAddress(process.env.NEXT_PUBLIC_HIVE_PROPAGATION_ENGINE, hiveDeployment.propagationEngine),
};

export function isHiveDeployed(): boolean {
  return hiveAddresses.agentRegistry !== "0x";
}
