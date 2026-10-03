import { createWalletClient, http } from "viem";
import type { LocalAccount } from "viem/accounts";
import { hiveChain } from "./clients";

// A Hive signer is any viem local account that can sign Monad writes, plus a
// way to zero its keys when done (Mera sessions zero on end()).
export interface HiveSigner {
  account: LocalAccount;
  end(): void;
}

export function createHiveWalletClient(signer: HiveSigner) {
  return createWalletClient({
    account: signer.account,
    chain: hiveChain,
    transport: http(),
  });
}
