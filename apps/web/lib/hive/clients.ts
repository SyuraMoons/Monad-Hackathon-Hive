import { createPublicClient, http } from "viem";
import { monadTestnet } from "@hive/shared";

export const hiveChain = monadTestnet;

// Read-only client for the permission layer. Writes land behind the HiveSigner
// interface (AK-9) and always carry an explicit gas limit (rule 5).
export const hivePublicClient = createPublicClient({
  chain: hiveChain,
  transport: http(),
});
