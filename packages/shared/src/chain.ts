export { monadTestnet } from "viem/chains";

/** Monad testnet explorer (rules A4). Every link the UI shows must open here (T8). */
export const EXPLORER_URL = "https://testnet.monadscan.com";

const trim = (base: string) => base.replace(/\/+$/, "");

export const explorerTxUrl = (hash: string, base: string = EXPLORER_URL) => `${trim(base)}/tx/${hash}`;
export const explorerAddressUrl = (address: string, base: string = EXPLORER_URL) => `${trim(base)}/address/${address}`;
