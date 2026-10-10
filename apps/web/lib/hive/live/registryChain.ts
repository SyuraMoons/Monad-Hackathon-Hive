import { AgentRegistryAbi, HiveError, hiveDeployment } from "@hive/shared";
import { decodeAgentRegisteredId, registerAgent, setAgentWriter } from "../account";
import { hivePublicClient } from "../clients";
import type { HiveSigner } from "../signer";
import type { ChainAgent, RegistryDeps } from "./registry";

/** Reads need no signer. */
export const chainReader: Pick<RegistryDeps, "agentsOf"> = {
  async agentsOf(owner): Promise<ChainAgent[]> {
    try {
      const [ids, list] = await hivePublicClient.readContract({ address: hiveDeployment.agentRegistry, abi: AgentRegistryAbi, functionName: "agentsOf", args: [owner] });
      return list.map((a, i) => ({ id: ids[i]!, owner: a.owner, name: a.name, agentType: a.agentType, writer: a.writer, registeredAt: a.registeredAt }));
    } catch {
      throw new HiveError("CHAIN_ERROR", "Could not read the agent registry.");
    }
  },
};

export async function confirmed(hash: `0x${string}`) {
  const receipt = await hivePublicClient.waitForTransactionReceipt({ hash, confirmations: 1, pollingInterval: 500 });
  if (receipt.status !== "success") throw new HiveError("CHAIN_ERROR", "The transaction was reverted onchain.");
  return receipt;
}

/** The signer pays gas (ADR-006). Both writes go through account.ts, which sets an explicit gas limit (rule 5). */
export function chainRegistry(signer: HiveSigner): RegistryDeps {
  return {
    ...chainReader,
    async register(name, agentType, agentKey) {
      const txHash = await registerAgent(signer, name, agentType, agentKey);
      const agentId = decodeAgentRegisteredId(await confirmed(txHash));
      if (agentId === undefined) throw new HiveError("CHAIN_ERROR", "The registration receipt has no agent id.");
      return { agentId, txHash };
    },
    async setWriter(agentId, writer) {
      const txHash = await setAgentWriter(signer, agentId, writer);
      await confirmed(txHash);
      return txHash;
    },
  };
}
