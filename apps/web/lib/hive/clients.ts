import { createPublicClient, http } from "viem";
import { monadTestnet } from "@hive/shared";

export const hiveChain = monadTestnet;

// NEXT_PUBLIC_MONAD_RPC overrides the viem chain default (rule 4 keeps URLs out
// of app code; monadTestnet defaults to https://testnet-rpc.monad.xyz).
const rpcUrl = process.env.NEXT_PUBLIC_MONAD_RPC;
// batch: the registry scan reads several agents at once; JSON-RPC batching sends them as one HTTP request, and the
// longer backoff rides out the public RPC's 429s.
const transportOptions = { batch: true, retryCount: 5, retryDelay: 400 };
export const hiveTransport = rpcUrl ? http(rpcUrl, transportOptions) : http(undefined, transportOptions);

// Read-only client for the permission layer. Writes land behind the HiveSigner
// interface (AK-9) and always carry an explicit gas limit (rule 5).
export const hivePublicClient = createPublicClient({
  chain: hiveChain,
  transport: hiveTransport,
});
