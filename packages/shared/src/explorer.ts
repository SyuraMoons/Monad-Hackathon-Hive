import { monadTestnet } from "viem/chains";

const EXPLORER_FALLBACK = "https://testnet.monadexplorer.com";

function baseUrl(): string {
  return (monadTestnet.blockExplorers?.default.url ?? EXPLORER_FALLBACK).replace(/\/+$/, "");
}

// Block explorer URLs for Monad testnet. Reads from the viem chain definition
// (blockExplorers.default.url) — never "HashScan" (that is Hedera; Monad uses
// MonadVision / Monadscan).
export function explorerUrl(txHash: `0x${string}`): string {
  return `${baseUrl()}/tx/${txHash}`;
}

export function explorerAddressUrl(address: `0x${string}`): string {
  return `${baseUrl()}/address/${address}`;
}
