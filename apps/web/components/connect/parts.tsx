"use client";

import { useState, type ReactNode } from "react";
import type { InstallTab } from "@/components/ui/InstallCard";
import { isLocalUrl } from "@/lib/hive/commands";

export function Steps({ children }: { children: ReactNode }) {
  return <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[15px] leading-[1.5] text-ink-2">{children}</ol>;
}

export function Prose({ children }: { children: ReactNode }) {
  return <p className="text-[15px] leading-[1.5] text-ink-2">{children}</p>;
}

export function Fine({ children }: { children: ReactNode }) {
  return <p className="text-[14px] leading-[1.5] text-ink-2">{children}</p>;
}

export function CopyUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the URL is on screen to select.
    }
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-modal bg-ink px-4 py-3">
      <code className="min-w-0 overflow-x-auto font-mono text-[15px] whitespace-nowrap text-clay">{url}</code>
      <button type="button" onClick={() => void copy()} aria-label="Copy connector URL" className="min-h-9 shrink-0 cursor-pointer rounded-chip px-2 text-[14px] font-medium text-paper hover:bg-paper/10">
        {copied ? "✓ Copied" : "⧉ Copy"}
      </button>
    </div>
  );
}

/** The connector URL box for a hosted client (claude.ai, ChatGPT): its provider's servers call the bridge, so it must be public. */
export function ConnectorUrl({ url, provider }: { url: string; provider: string }) {
  if (!url) return <Prose>The app doesn’t know where the bridge is (NEXT_PUBLIC_BRIDGE_URL is not set).</Prose>;
  return (
    <>
      <CopyUrl url={url} />
      {isLocalUrl(url) && (
        <p role="alert" className="text-[14px] leading-[1.45] text-status-revoked">
          This is a local address. {provider} calls it from its own servers, so it only works once the bridge is deployed on a public URL.
        </p>
      )}
    </>
  );
}

/** Builds an `InstallCard` that already knows the agent's token and the setup / error state of the surrounding page. */
export type GuideCard = (kind: InstallTab, command: string, note: ReactNode, secondary?: { caption: string; command: string }) => ReactNode;

export type GuideBodyProps = { name: string; url: string; token: string; tab: string; card: GuideCard };
