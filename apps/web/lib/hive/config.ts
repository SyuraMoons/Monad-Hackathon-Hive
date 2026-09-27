import type { Address } from "viem";

export interface HiveAddresses {
  agentRegistry: Address;
  knowledgeGraph: Address;
  memorySlots: Address;
  propagationEngine: Address;
}

function parseAddress(value: string | undefined): Address {
  return value && /^0x[0-9a-fA-F]{40}$/.test(value) ? (value as Address) : "0x";
}

// Contract addresses come from env (NEXT_PUBLIC_* is inlined by Next at build
// time). Empty ("0x") until AK-7 deploys and fills these in .env.
export const hiveAddresses: HiveAddresses = {
  agentRegistry: parseAddress(process.env.NEXT_PUBLIC_HIVE_AGENT_REGISTRY),
  knowledgeGraph: parseAddress(process.env.NEXT_PUBLIC_HIVE_KNOWLEDGE_GRAPH),
  memorySlots: parseAddress(process.env.NEXT_PUBLIC_HIVE_MEMORY_SLOTS),
  propagationEngine: parseAddress(process.env.NEXT_PUBLIC_HIVE_PROPAGATION_ENGINE),
};

export function isHiveDeployed(): boolean {
  return hiveAddresses.agentRegistry !== "0x";
}
