"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Popover } from "@/components/ui/Popover";
import { explorerAddress } from "@/lib/explorer";
import { useSession } from "@/lib/stores/session";
import { useUi } from "@/lib/stores/ui";

const item = "flex min-h-10 w-full cursor-pointer items-center px-[18px] py-2.5 text-left text-[15px] whitespace-pre text-ink hover:bg-paper-2 focus-visible:bg-paper-2 focus-visible:outline-none";

/** `0x7f3a9c…e4b1c21e`: longer than a hash chip, so the address can be recognised at a glance. */
const longAddress = (a: string) => `${a.slice(0, 8)}…${a.slice(-8)}`;

// Figma Wallet menu (93:43, Canvas 7 93:290). Gas is sponsored, so the balance block and faucet row are replaced
// by "Gas sponsored by Hive" (rules A5, design D3, and the component's own note).
export function WalletMenu({ address }: { address: string }) {
  const router = useRouter();
  const setUi = useUi((s) => s.set);
  const signOut = useSession((s) => s.signOut);
  const revealRecoveryPhrase = useSession((s) => s.revealRecoveryPhrase);
  const [copied, setCopied] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // Held only while the menu is open; closing it unmounts the words.
  const [phrase, setPhrase] = useState<string[] | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);

  async function reveal() {
    setRevealing(true);
    setRevealError(null);
    try {
      setPhrase((await revealRecoveryPhrase()).split(" "));
    } catch (e) {
      setRevealError(e instanceof Error ? e.message : String(e));
    } finally {
      setRevealing(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked; the address is visible to select */
    }
  }

  async function leave() {
    setLeaving(true);
    // Ends every agent session on the bridge, zeroes the passkey keys and clears the session store.
    setUi({ walletMenu: false, drawerAgentId: null, edgeMenu: null, revokeEdge: null, edgeEditor: null, zones: false });
    await signOut(); // the app shell then sends us home (signedOutOnPurpose)
    router.replace("/");
  }

  return (
    <Popover
      role="dialog"
      label="Your passkey wallet"
      onClose={() => setUi({ walletMenu: false })}
      className="top-[calc(100%+8px)] right-0 w-80 rounded-menu border border-ink bg-paper shadow-popover"
    >
      <div className="flex flex-col gap-2 px-[18px] py-4 text-[14px]">
        <p className="font-mono text-ink-3">YOUR PASSKEY WALLET</p>
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono font-medium text-ink" title={address}>{longAddress(address)}</p>
          <button type="button" onClick={copy} className="min-h-9 cursor-pointer font-medium text-ink underline underline-offset-2">
            {copied ? "Copied" : "Copy"}
            <span className="sr-only" aria-live="polite">{copied ? "Address copied" : ""}</span>
          </button>
        </div>
        <p className="leading-[1.5] text-ink-2">Created by your Mera passkey. Nothing to install.</p>
      </div>
      <div className="h-px bg-line" aria-hidden="true" />
      {phrase ? (
        <div className="flex flex-col gap-3 px-[18px] py-4 text-[14px]">
          <p className="font-mono text-ink-3">RECOVERY PHRASE</p>
          <ol className="grid grid-cols-3 gap-x-3 gap-y-1.5 font-mono text-[13px] text-ink">
            {phrase.map((w, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="w-5 text-right text-ink-3">{i + 1}</span>
                {w}
              </li>
            ))}
          </ol>
          <p className="leading-[1.5] text-ink-2">Anyone with these 24 words controls this account. Write them down offline. Hive never stores them.</p>
          <button type="button" onClick={() => setPhrase(null)} className="min-h-9 cursor-pointer self-start font-medium text-ink underline underline-offset-2">
            Hide phrase
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-1 px-[18px] py-3 text-[14px]">
          <button type="button" onClick={() => void reveal()} disabled={revealing} className="min-h-9 cursor-pointer self-start font-medium text-ink underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-45">
            {revealing ? "Waiting for passkey…" : "Show recovery phrase"}
          </button>
          <p className="leading-[1.5] text-ink-3">Restores this account if the passkey is lost. Your passkey confirms first.</p>
          {revealError && <p role="alert" className="leading-[1.5] text-status-revoked">{revealError}</p>}
        </div>
      )}
      <div className="h-px bg-line" aria-hidden="true" />
      <div className="flex flex-col gap-1 px-[18px] py-4">
        <p className="font-display text-[24px] leading-tight text-ink">Gas sponsored by Hive</p>
        <p className="font-mono text-[14px] whitespace-pre-wrap text-ink-3">Monad testnet  ·  signing costs you nothing</p>
      </div>
      <div className="h-px bg-line" aria-hidden="true" />
      <div className="py-1.5">
        <a href={explorerAddress(address)} target="_blank" rel="noreferrer" className={item}>
          View on Monadscan  →
        </a>
        <button type="button" onClick={() => void leave()} disabled={leaving} className={`${item} text-ink-2 disabled:opacity-45`}>
          {leaving ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </Popover>
  );
}
