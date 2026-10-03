import { AgentRegistryAbi, KnowledgeGraphAbi, MemorySlotsAbi, hiveDeployment } from "@hive/shared";
import type { PublicClient } from "viem";
import type { ChainAgent, ChainEdge, ChainReader, ChainSlot } from "./types.js";

/**
 * Live Monad testnet state. Nothing is cached: a revoked edge must block the very next read, so every call hits the RPC.
 * Errors propagate on purpose; `readMemory` turns any failure into default deny.
 */
export class ViemChainReader implements ChainReader {
  constructor(private client: Pick<PublicClient, "readContract">) {}

  async edgesTo(agentId: bigint): Promise<ChainEdge[]> {
    const edges = await this.client.readContract({ address: hiveDeployment.knowledgeGraph, abi: KnowledgeGraphAbi, functionName: "edgesTo", args: [agentId] });
    return edges.map((e) => ({ id: e.id, from: e.from, to: e.to, topicHash: e.topic, expiresAt: e.expiresAt, active: e.active }));
  }

  async slotsSince(agentId: bigint, since: bigint): Promise<ChainSlot[]> {
    const slots = await this.client.readContract({ address: hiveDeployment.memorySlots, abi: MemorySlotsAbi, functionName: "slotsSince", args: [agentId, since] });
    return slots.map((s) => ({ id: s.id, agentId: s.agentId, contentHash: s.contentHash, topic: s.topic, writtenAt: s.writtenAt }));
  }

  async agent(agentId: bigint): Promise<ChainAgent> {
    const a = await this.client.readContract({ address: hiveDeployment.agentRegistry, abi: AgentRegistryAbi, functionName: "agents", args: [agentId] });
    return { id: agentId, name: a.name, owner: a.owner };
  }
}
