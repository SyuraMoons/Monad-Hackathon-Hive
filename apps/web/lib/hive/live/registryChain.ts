import { AgentRegistryAbi, HiveError, hiveDeployment } from "@hive/shared";
import { BaseError, ContractFunctionRevertedError } from "viem";
import { decodeAgentRegisteredId, registerAgent, setAgentWriter } from "../account";
import { hivePublicClient } from "../clients";
import type { HiveSigner } from "../signer";
import type { ChainAgent, RegistryDeps } from "./registry";

const isUnknownAgentRevert = (e: unknown) =>
  e instanceof BaseError && e.walk((x) => x instanceof ContractFunctionRevertedError && x.data?.errorName === "UnknownAgent") !== null;

/** Reads need no signer. */
export const chainReader: Pick<RegistryDeps, "readAgent"> = {
  async readAgent(id): Promise<ChainAgent | null> {
    try {
      const a = await hivePublicClient.readContract({ address: hiveDeployment.agentRegistry, abi: AgentRegistryAbi, functionName: "agents", args: [id] });
      return { id, owner: a.owner, name: a.name, agentType: a.agentType, writer: a.writer, registeredAt: a.registeredAt };
    } catch (e) {
      if (isUnknownAgentRevert(e)) return null;
      throw new HiveError("CHAIN_ERROR", "Could not read the agent registry.");
    }
  },
};

export async function confirmed(hash: `0x${string}`) {
  const receipt = await hivePublicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
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
