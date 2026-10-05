import { EXPLORER_URL, explorerAddressUrl, explorerTxUrl } from "@hive/shared";

const base = process.env.NEXT_PUBLIC_EXPLORER_URL || EXPLORER_URL;

export const explorerTx = (hash: string) => explorerTxUrl(hash, base);
export const explorerAddress = (address: string) => explorerAddressUrl(address, base);
