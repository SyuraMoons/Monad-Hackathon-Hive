"use client";

import { privateKeyToAccount } from "viem/accounts";
import { decodeEventLog, encodeFunctionData } from "viem";
import type { Hex, TransactionReceipt } from "viem";
import {
  AgentRegistryAbi,
  ERC8004_HIVE_AGENT_KEY,
  Erc8004IdentityRegistryAbi,
  KnowledgeGraphAbi,
  MemorySlotsAbi,
  encodeHiveAgentRef,
  erc8004Deployment,
  hiveDeployment,
} from "@hive/shared";
import { bufferedGas, GAS_FALLBACKS } from "./gas";
import { createHiveWalletClient, type HiveSigner } from "./signer";

// D10: dev-only raw-key signer, gated by NEXT_PUBLIC_HIVE_DEV_SIGNER. The key
// is bundled into the client, so never point it at a wallet holding real value.
export function devSigner(): HiveSigner | null {
  if (process.env.NEXT_PUBLIC_HIVE_DEV_SIGNER !== "true") return null;
  const key = process.env.NEXT_PUBLIC_HIVE_DEV_SIGNER_PRIVATE_KEY;
  if (!key) return null;
  return { account: privateKeyToAccount(key as Hex), end: () => {} };
}

// Reads the newly assigned agent id from an AgentRegistered log.
export function decodeAgentRegisteredId(receipt: TransactionReceipt): bigint | undefined {
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({ abi: AgentRegistryAbi, data: log.data, topics: log.topics });
      if (decoded.eventName === "AgentRegistered" && typeof decoded.args.agentId === "bigint") {
        return decoded.args.agentId;
      }
    } catch {
      // not an AgentRegistry log
    }
  }
  return undefined;
}

// Reads the new edge id from an EdgeAdded log.
export function decodeEdgeAddedId(receipt: TransactionReceipt): bigint | undefined {
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({ abi: KnowledgeGraphAbi, data: log.data, topics: log.topics });
      if (decoded.eventName === "EdgeAdded" && typeof decoded.args.edgeId === "bigint") return decoded.args.edgeId;
    } catch {
      // not a KnowledgeGraph log
    }
  }
  return undefined;
}

export async function registerAgent(
  signer: HiveSigner,
  name: string,
  agentType: string,
  agentPubKey: Hex,
): Promise<Hex> {
  const client = createHiveWalletClient(signer);
  const address = hiveDeployment.agentRegistry;
  const args = [name, agentType, agentPubKey] as const;
  const gas = await bufferedGas(
    client,
    address,
    encodeFunctionData({ abi: AgentRegistryAbi, functionName: "register", args }),
    GAS_FALLBACKS.register,
  );
  return client.writeContract({ address, abi: AgentRegistryAbi, functionName: "register", args, gas });
}

export async function setAgentWriter(
  signer: HiveSigner,
  agentId: bigint,
  writer: Hex,
): Promise<Hex> {
  const client = createHiveWalletClient(signer);
  const address = hiveDeployment.agentRegistry;
  const args = [agentId, writer] as const;
  const gas = await bufferedGas(
    client,
    address,
    encodeFunctionData({ abi: AgentRegistryAbi, functionName: "setAgentWriter", args }),
    GAS_FALLBACKS.setAgentWriter,
  );
  return client.writeContract({ address, abi: AgentRegistryAbi, functionName: "setAgentWriter", args, gas });
}

// Reads the new ERC-8004 id from the registry's own Registered log.
export function decodeErc8004RegisteredId(receipt: TransactionReceipt): bigint | undefined {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== erc8004Deployment.identityRegistry.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: Erc8004IdentityRegistryAbi, data: log.data, topics: log.topics });
      if (decoded.eventName === "Registered") return decoded.args.agentId;
    } catch {
      // another event of the registry (Transfer, MetadataSet)
    }
  }
  return undefined;
}

// ADR-028: an ERC-8004 identity whose metadata points back at the Hive agent. It grants nothing.
export async function registerErc8004Identity(
  signer: HiveSigner,
  agentURI: string,
  hiveAgentId: bigint,
): Promise<Hex> {
  const client = createHiveWalletClient(signer);
  const address = erc8004Deployment.identityRegistry;
  const args = [agentURI, [{ metadataKey: ERC8004_HIVE_AGENT_KEY, metadataValue: encodeHiveAgentRef(hiveDeployment.agentRegistry, hiveAgentId) }]] as const;
  const gas = await bufferedGas(
    client,
    address,
    encodeFunctionData({ abi: Erc8004IdentityRegistryAbi, functionName: "register", args }),
    GAS_FALLBACKS.registerIdentity,
  );
  return client.writeContract({ address, abi: Erc8004IdentityRegistryAbi, functionName: "register", args, gas });
}

export async function addEdge(
  signer: HiveSigner,
  from: bigint,
  to: bigint,
  topic: string,
  expiresAt: bigint,
): Promise<Hex> {
  const client = createHiveWalletClient(signer);
  const address = hiveDeployment.knowledgeGraph;
  const args = [from, to, topic, expiresAt] as const;
  const gas = await bufferedGas(
    client,
    address,
    encodeFunctionData({ abi: KnowledgeGraphAbi, functionName: "addEdge", args }),
    GAS_FALLBACKS.addEdge,
  );
  return client.writeContract({ address, abi: KnowledgeGraphAbi, functionName: "addEdge", args, gas });
}

export async function removeEdge(signer: HiveSigner, edgeId: bigint): Promise<Hex> {
  const client = createHiveWalletClient(signer);
  const address = hiveDeployment.knowledgeGraph;
  const args = [edgeId] as const;
  const gas = await bufferedGas(
    client,
    address,
    encodeFunctionData({ abi: KnowledgeGraphAbi, functionName: "removeEdge", args }),
    GAS_FALLBACKS.removeEdge,
  );
  return client.writeContract({ address, abi: KnowledgeGraphAbi, functionName: "removeEdge", args, gas });
}

export async function writeMemory(
  signer: HiveSigner,
  agentId: bigint,
  contentHash: Hex,
  topic: string,
): Promise<Hex> {
  const client = createHiveWalletClient(signer);
  const address = hiveDeployment.memorySlots;
  const args = [agentId, contentHash, topic] as const;
  const gas = await bufferedGas(
    client,
    address,
    encodeFunctionData({ abi: MemorySlotsAbi, functionName: "write", args }),
    GAS_FALLBACKS.write,
  );
  return client.writeContract({ address, abi: MemorySlotsAbi, functionName: "write", args, gas });
}
