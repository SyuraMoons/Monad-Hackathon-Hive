"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PillButton } from "@/components/ui/Pill";
import { FAUCET_URL } from "@/lib/explorer";
import { getHiveClient } from "@/lib/hive/client";
import { useUi } from "@/lib/stores/ui";

type Balance = { mon: string; low: boolean } | "error" | null;

/**
 * Shown on the Connect page while the owner has no agent of the open type. A new account holds no MON, so nothing is
 * registered from here: it names the account to fund, watches the balance, then sends the user to the canvas to create the agent.
 */
export function FirstAgentCard({ agentName, owner }: { agentName: string; owner: string }) {
  const router = useRouter();
  const [balance, setBalance] = useState<Balance>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    const read = async () => {
      const next = await (await getHiveClient()).status.balance().catch(() => "error" as const);
      if (live) setBalance(next);
    };
    void read();
    const timer = setInterval(read, 3000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [owner]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(owner);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked; the address is visible to select */
    }
  }

  const funded = typeof balance === "object" && balance !== null && !balance.low;
  const waiting = typeof balance === "object" && balance !== null && balance.low;
  const link = "min-h-9 cursor-pointer text-[14px] font-medium text-ink underline underline-offset-2";

  return (
    <div className="flex w-full flex-col gap-5 rounded-modal border border-line bg-paper-2 px-6 py-5">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-[14px] tracking-[0.1em] text-ink-3">1  ·  GET TEST MON</p>
        <p className="text-[15px] leading-[1.5] text-ink-2">Your account pays the gas for what you sign, and a new account starts empty. Send test MON to this address.</p>
        <p className="font-mono text-[14px] font-medium break-all text-ink">{owner}</p>
        <div className="flex flex-wrap items-center gap-4">
          <button type="button" onClick={copy} className={link}>
            {copied ? "Copied" : "Copy address"}
            <span className="sr-only" aria-live="polite">{copied ? "Address copied" : ""}</span>
          </button>
          <a href={FAUCET_URL} target="_blank" rel="noreferrer" className={`inline-flex items-center ${link}`}>
            Open faucet  →
          </a>
        </div>
        <p className={`font-mono text-[14px] ${funded ? "text-status-active" : "text-ink-2"}`} role="status">
          {balance === null
            ? "Checking the balance…"
            : balance === "error"
              ? "Balance unavailable right now."
              : funded
                ? `${balance.mon} MON  ·  enough to start`
                : `${balance.mon} MON  ·  waiting for the MON to arrive…`}
        </p>
      </div>
      <div className="h-px w-full bg-line" aria-hidden="true" />
      <div className="flex flex-col items-start gap-3">
        <p className="font-mono text-[14px] tracking-[0.1em] text-ink-3">2  ·  CREATE THE AGENT</p>
        <p className="text-[15px] leading-[1.5] text-ink-2">
          You have no {agentName} agent yet. Create it on the canvas. After that, this page shows the command that connects it.
        </p>
        <PillButton
          disabled={waiting}
          onClick={() => {
            useUi.getState().set({ newAgent: true });
            router.push("/canvas");
          }}
        >
          Create on the canvas
        </PillButton>
      </div>
    </div>
  );
}
