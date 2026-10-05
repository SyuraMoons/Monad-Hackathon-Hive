"use client";

import { useEffect, useState } from "react";
import type { Hex } from "viem";
import { explorerTxUrl } from "@hive/shared";
import { hivePublicClient } from "./clients";

export type TxStatus = "idle" | "pending" | "confirmed" | "failed";

export interface TxStatusState {
  status: TxStatus;
  hash: Hex | undefined;
  explorerUrl: string | undefined;
  error: Error | null;
}

// Tracks a broadcast transaction until it confirms. Exposes the explorer URL
// via @hive/shared (MonadVision / Monadscan) — never a hard-coded "HashScan".
export function useTxStatus(hash: Hex | undefined): TxStatusState {
  const [state, setState] = useState<TxStatusState>({
    status: "idle",
    hash: undefined,
    explorerUrl: undefined,
    error: null,
  });

  useEffect(() => {
    if (!hash) {
      setState({ status: "idle", hash: undefined, explorerUrl: undefined, error: null });
      return;
    }

    let cancelled = false;
    setState({ status: "pending", hash, explorerUrl: explorerTxUrl(hash), error: null });

    hivePublicClient
      .waitForTransactionReceipt({ hash, confirmations: 1 })
      .then((receipt) => {
        if (cancelled) return;
        setState({
          status: receipt.status === "success" ? "confirmed" : "failed",
          hash,
          explorerUrl: explorerTxUrl(hash),
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: "failed",
          hash,
          explorerUrl: explorerTxUrl(hash),
          error: err instanceof Error ? err : new Error(String(err)),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [hash]);

  return state;
}
