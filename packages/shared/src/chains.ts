// Canonical chain for Hive. Apps import the chain from here so the chain id
// and RPC URLs are never hard-coded in app code (rule 4).
export { monadTestnet, monadTestnet as hiveChain } from "viem/chains";
