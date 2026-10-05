import { HiveError, MemorySlotsAbi, hiveDeployment } from "@hive/shared";
import { hivePublicClient } from "../clients";
import type { HistoryDeps } from "./history";

/** Reads need no signer. */
export const chainHistory: HistoryDeps = {
  async slotsSince(agentId, since) {
    try {
      const slots = await hivePublicClient.readContract({ address: hiveDeployment.memorySlots, abi: MemorySlotsAbi, functionName: "slotsSince", args: [agentId, since] });
      return slots.map((s) => ({ id: s.id, agentId: s.agentId, contentHash: s.contentHash, topic: s.topic, writtenAt: s.writtenAt }));
    } catch {
      throw new HiveError("CHAIN_ERROR", "Could not read the memory history from Monad.");
    }
  },
};
