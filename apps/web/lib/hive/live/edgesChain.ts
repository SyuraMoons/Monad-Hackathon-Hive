import { HiveError, KnowledgeGraphAbi, hiveDeployment } from "@hive/shared";
import { addEdge, decodeEdgeAddedId, removeEdge } from "../account";
import { hivePublicClient } from "../clients";
import type { HiveSigner } from "../signer";
import type { EdgeDeps } from "./edges";
import { confirmed } from "./registryChain";

/** Reads need no signer. */
export const edgeReader: Pick<EdgeDeps, "edgesFrom"> = {
  async edgesFrom(agentId) {
    try {
      const rows = await hivePublicClient.readContract({ address: hiveDeployment.knowledgeGraph, abi: KnowledgeGraphAbi, functionName: "edgesFrom", args: [agentId] });
      return rows.map((e) => ({ id: e.id, from: e.from, to: e.to, topic: e.topic, expiresAt: e.expiresAt, active: e.active }));
    } catch {
      throw new HiveError("CHAIN_ERROR", "Could not read the edges from Monad.");
    }
  },
};

/** The signer pays gas (ADR-006). Both writes go through account.ts, which sets an explicit gas limit (rule 5). */
export function chainEdges(signer: HiveSigner): EdgeDeps {
  return {
    ...edgeReader,
    async add(from, to, topic, expiresAt) {
      const txHash = await addEdge(signer, from, to, topic, expiresAt);
      const edgeId = decodeEdgeAddedId(await confirmed(txHash));
      if (edgeId === undefined) throw new HiveError("CHAIN_ERROR", "The edge receipt has no edge id.");
      return { edgeId, txHash };
    },
    async remove(edgeId) {
      const txHash = await removeEdge(signer, edgeId);
      await confirmed(txHash);
      return txHash;
    },
  };
}
