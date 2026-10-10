"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { StatusDot } from "./StatusDot";

export type InstallTab = "claude" | "ai" | "desktop" | "gpt" | "deepseek";

const BAR_LABEL: Record<InstallTab, string> = {
  claude: "Terminal · Claude Code",
  ai: "Prompt · paste into your AI",
  desktop: "claude_desktop_config.json",
  gpt: "OpenAI API",
  deepseek: "Terminal · DeepSeek runner",
};

/** Displays `hive_sk_7f3a…` / `eyJh…`: only the first 4 characters of the secret (step 5). */
function maskToken(token: string): string {
  const prefix = token.startsWith("hive_sk_") ? "hive_sk_" : "";
  return `${prefix}${token.slice(prefix.length, prefix.length + 4)}…`;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Colours URLs (clay) and the token (amber), and shows the token masked. Copy always uses the real text.
function render(line: string, token: string, mask: boolean): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = new RegExp(`(https?://[^\\s"'\\\\]+)${token ? `|(${escapeRe(token)})` : ""}`, "g");
  let last = 0;
  for (const m of line.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) parts.push(line.slice(last, i));
    parts.push(
      m[1] ? <span key={i} className="text-clay">{m[1]}</span> : <span key={i} className="text-amber">{mask ? maskToken(m[0]) : m[0]}</span>,
    );
    last = i + m[0].length;
  }
  if (last < line.length) parts.push(line.slice(last));
  return parts;
}

function useCopy() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  async function copy(text: string, fallbackTarget: HTMLElement | null) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (http, permissions): select the text so ⌘/Ctrl+C works.
      if (fallbackTarget) {
        const range = document.createRange();
        range.selectNodeContents(fallbackTarget);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }
  return { copied, copy };
}

function CopyButton({ onClick, copied, disabled, label }: { onClick: () => void; copied: boolean; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="-mr-2 inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-2 rounded-chip px-2 text-[14px] font-medium text-paper hover:bg-paper/10 focus-visible:outline-paper disabled:cursor-not-allowed disabled:opacity-45"
    >
      <span aria-hidden="true">{copied ? "✓" : "⧉"}</span>
      {copied ? "Copied" : "Copy"}
      <span className="sr-only" aria-live="polite">{copied ? "Copied to clipboard" : ""}</span>
    </button>
  );
}

function Code({ text, token, mask, codeRef }: { text: string; token: string; mask: boolean; codeRef: React.Ref<HTMLElement> }) {
  return (
    <pre className="max-w-full min-w-0 overflow-x-auto font-mono text-[15px] leading-[1.75] text-paper">
      <code ref={codeRef}>
        {text.split("\n").map((line, i) => (
          <span key={i} className="block min-h-[1.75em] whitespace-pre">{render(line, token, mask)}</span>
        ))}
      </code>
    </pre>
  );
}

/**
 * Terminal card (Connect 54:89). `command` is copied verbatim; `token` is highlighted and, unless
 * `maskToken` is false, shown as its first 4 characters. `pending` replaces the code while the agent is set up.
 */
export function InstallCard({ tab, command, token, note, pending, error, onRetry, retryLabel = "Try again", secondary, maskToken: mask = true, className }: {
  tab: InstallTab;
  command: string;
  token: string;
  note: ReactNode;
  pending?: string;
  error?: string;
  onRetry?: () => void;
  retryLabel?: string;
  secondary?: { caption: string; command: string };
  maskToken?: boolean;
  className?: string;
}) {
  const main = useCopy();
  const extra = useCopy();
  const mainRef = useRef<HTMLElement>(null);
  const extraRef = useRef<HTMLElement>(null);
  const ready = !pending && !error;

  return (
    <div className={cn("flex w-full flex-col gap-[18px] rounded-modal bg-ink px-6 pt-[18px] pb-5", className)}>
      <div className="flex items-center justify-between gap-4 text-[14px]">
        <p className="min-w-0 font-mono whitespace-pre-wrap text-clay">{BAR_LABEL[tab].replace(" · ", "  ·  ")}</p>
        <CopyButton label={tab === "ai" ? "Copy prompt" : "Copy command"} copied={main.copied} disabled={!ready} onClick={() => main.copy(command, mainRef.current)} />
      </div>

      {pending ? (
        <p className="flex min-h-[5.25em] items-center gap-3 font-mono text-[15px] text-clay" role="status">
          <StatusDot status="pending" />
          {pending}
        </p>
      ) : error ? (
        <div className="flex min-h-[5.25em] flex-col items-start justify-center gap-3" role="alert">
          <p className="text-[15px] text-paper">{error}</p>
          {onRetry && (
            <button type="button" onClick={onRetry} className="min-h-9 cursor-pointer text-[15px] font-medium text-amber underline underline-offset-2">
              {retryLabel}
            </button>
          )}
        </div>
      ) : (
        <Code text={command} token={token} mask={mask} codeRef={mainRef} />
      )}

      {secondary && ready && (
        <>
          <div className="h-px w-full bg-paper opacity-[.14]" aria-hidden="true" />
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4">
              <p className="font-mono text-[14px] text-clay">{secondary.caption}</p>
              <CopyButton label="Copy runner command" copied={extra.copied} onClick={() => extra.copy(secondary.command, extraRef.current)} />
            </div>
            <Code text={secondary.command} token={token} mask={mask} codeRef={extraRef} />
          </div>
        </>
      )}

      <div className="h-px w-full bg-paper opacity-[.14]" aria-hidden="true" />
      <p className="text-[14px] leading-[1.5] text-clay">{note}</p>
    </div>
  );
}
