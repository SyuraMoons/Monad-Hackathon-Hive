"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type InstallTab = "claude" | "gpt";

const BAR_LABEL: Record<InstallTab, string> = {
  claude: "Terminal · Claude Code",
  gpt: "OpenAI API",
};

// Colours the URL (clay) and the token (amber) inside the command, like Connect 54:89.
function highlight(line: string, token: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = new RegExp(`(https?://\\S+?)(?=\\s|"|$)|(${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "g");
  let last = 0;
  for (const m of line.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) parts.push(line.slice(last, i));
    parts.push(
      <span key={i} className={m[1] ? "text-clay" : "text-amber"}>{m[0]}</span>,
    );
    last = i + m[0].length;
  }
  if (last < line.length) parts.push(line.slice(last));
  return parts;
}

// Terminal card, Connect 54:89. `command` is copied verbatim; `token` is highlighted wherever it appears.
export function InstallCard({ tab, command, token, note, className }: {
  tab: InstallTab;
  command: string;
  token: string;
  note: ReactNode;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={cn("flex w-full flex-col gap-[18px] rounded-modal bg-ink px-6 pt-[18px] pb-5", className)}>
      <div className="flex items-center justify-between gap-4 text-[14px]">
        <p className="min-w-0 font-mono whitespace-pre-wrap text-clay">{BAR_LABEL[tab].replace(" · ", "  ·  ")}</p>
        <button
          type="button"
          onClick={copy}
          className="-mr-2 inline-flex shrink-0 min-h-9 cursor-pointer items-center gap-2 rounded-chip px-2 font-medium text-paper hover:bg-paper/10 focus-visible:outline-paper"
        >
          <span aria-hidden="true">{copied ? "✓" : "⧉"}</span>
          {copied ? "Copied" : "Copy"}
          <span className="sr-only" aria-live="polite">{copied ? "Command copied to clipboard" : ""}</span>
        </button>
      </div>
      <pre className="max-w-full min-w-0 overflow-x-auto font-mono text-[15px] leading-[1.75] text-paper">
        <code>
          {command.split("\n").map((line, i) => (
            <span key={i} className="block">{highlight(line, token)}</span>
          ))}
        </code>
      </pre>
      <div className="h-px w-full bg-paper opacity-[.14]" aria-hidden="true" />
      <p className="text-[14px] leading-[1.5] text-clay">{note}</p>
    </div>
  );
}
