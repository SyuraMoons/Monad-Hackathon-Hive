"use client";

import { useState, type ReactNode } from "react";
import { InstallCard, type InstallTab } from "@/components/ui/InstallCard";
import { Tabs } from "@/components/ui/Tabs";
import type { GuideType } from "@/lib/hive/agentTypes";
import { ClaudeGuide, CLAUDE_TABS } from "./ClaudeGuide";
import { DeepSeekGuide, DEEPSEEK_TABS } from "./DeepSeekGuide";
import { GptGuide, GPT_TABS } from "./GptGuide";

export type GuideStatus = { pending?: string; error?: string; retryLabel?: string; onRetry?: () => void };

const GUIDES = {
  claude: { tabs: CLAUDE_TABS, Body: ClaudeGuide, where: "Where Claude runs" },
  gpt: { tabs: GPT_TABS, Body: GptGuide, where: "Where ChatGPT runs" },
  deepseek: { tabs: DEEPSEEK_TABS, Body: DeepSeekGuide, where: "How DeepSeek connects" },
} as const;

/** One guide per agent type: a tab per way to connect it, each with numbered steps and copyable cards. Key it by agent type to reset the tab. */
export function ConnectGuide({ type, name, url, token, status, idPrefix }: {
  type: GuideType;
  name: string;
  url: string;
  token: string;
  status: GuideStatus;
  idPrefix: string;
}) {
  const guide = GUIDES[type];
  const [tab, setTab] = useState<string>(guide.tabs[0].key);
  const active = guide.tabs.some((t) => t.key === tab) ? tab : guide.tabs[0].key;

  const card = (kind: InstallTab, command: string, note: ReactNode, secondary?: { caption: string; command: string }) => (
    <InstallCard
      tab={kind}
      command={command}
      token={token}
      pending={status.pending}
      error={status.pending ? undefined : status.error}
      retryLabel={status.retryLabel}
      onRetry={status.onRetry}
      secondary={secondary}
      note={note}
    />
  );

  return (
    <>
      <Tabs<string> label={guide.where} idPrefix={idPrefix} value={active} onChange={setTab} items={[...guide.tabs]} />
      <div id={`${idPrefix}-panel`} role="tabpanel" aria-labelledby={`${idPrefix}-tab-${active}`} className="flex min-w-0 flex-col gap-4">
        <guide.Body name={name} url={url} token={token} tab={active} card={card} />
      </div>
    </>
  );
}
