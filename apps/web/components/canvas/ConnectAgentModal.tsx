"use client";

import { useState, type ReactNode } from "react";
import { zeroAddress } from "viem";
import { InstallCard, type InstallTab } from "@/components/ui/InstallCard";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { claudeCommand, claudeDesktopConfig, claudeTerminalCommand } from "@/lib/hive/commands";
import { useGraph } from "@/lib/stores/graph";
import { useSession } from "@/lib/stores/session";
import { useUi } from "@/lib/stores/ui";

type Tab = "code" | "desktop" | "web";

const TABS: { key: Tab; label: string }[] = [
  { key: "code", label: "Claude Code" },
  { key: "desktop", label: "Claude Desktop" },
  { key: "web", label: "Claude.ai" },
];

function Steps({ children }: { children: ReactNode }) {
  return <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[15px] leading-[1.5] text-ink-2">{children}</ol>;
}

/** Centered "Connect to Claude" dialog, opened from the agent drawer and the sidebar menu. */
export function ConnectAgentModal({ agentId }: { agentId: string }) {
  const agent = useGraph((s) => s.agents[agentId]);
  const authorization = useSession((s) => s.authorizations[agentId]);
  const locked = useSession((s) => s.status === "signed-in" && !s.keys);
  const authorizeAgent = useSession((s) => s.authorizeAgent);
  const [tab, setTab] = useState<Tab>("code");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const close = () => useUi.getState().set({ connectAgent: null });

  if (!agent) return null;
  const unfinished = agent.agentKey === zeroAddress;
  const token = authorization?.agentToken ?? "";
  const url = authorization?.mcpUrl ?? "";

  async function authorize() {
    setBusy(true);
    setError(undefined);
    try {
      await authorizeAgent(agent.agentId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not authorize the agent.");
    } finally {
      setBusy(false);
    }
  }

  // Both token tabs need the agent's token: without one the card asks for the passkey instead of showing a command.
  const missing = !token
    ? error ?? (unfinished
      ? `${agent.name} was registered, but its setup stopped halfway. Finishing is one transaction.`
      : `${agent.name} has no token in this tab. ${locked ? "Unlock with your passkey to create one." : "Authorize it to show the command."}`)
    : undefined;
  const retryLabel = unfinished ? "Finish setup" : locked ? "Unlock with passkey" : "Authorize";
  const pending = busy ? "Waiting for your passkey…" : undefined;

  const card = (kind: InstallTab, command: string, note: ReactNode, secondary?: { caption: string; command: string }) => (
    <InstallCard
      tab={kind}
      command={command}
      token={token}
      pending={pending}
      error={pending ? undefined : missing}
      retryLabel={retryLabel}
      onRetry={() => void authorize()}
      secondary={secondary}
      note={note}
    />
  );

  return (
    <Modal labelledBy="connect-agent-title" onClose={close} dismissible={!busy}>
      <div className="flex flex-col gap-1.5">
        <p className="font-mono text-[14px] tracking-[0.1em] text-ink-3">CONNECT</p>
        <h2 id="connect-agent-title" className="font-display text-[32px] leading-tight text-ink">Connect {agent.name} to Claude</h2>
      </div>

      <Tabs<Tab> label="Where Claude runs" idPrefix="connect-agent" value={tab} onChange={setTab} items={TABS} />

      <div id="connect-agent-panel" role="tabpanel" aria-labelledby={`connect-agent-tab-${tab}`} className="flex min-w-0 flex-col gap-4">
        {tab === "code" && card(
          "claude",
          claudeTerminalCommand(url, token, agent.name),
          "Run this in your project folder. Only that terminal is this agent, so several agents can share one folder, one terminal each. The token is scoped to this agent and expires in 24h.",
          token ? { caption: "or save it for the whole folder: every Claude Code session in it becomes this agent", command: claudeCommand(url, token) } : undefined,
        )}

        {tab === "desktop" && (
          <>
            <Steps>
              <li>Open Claude Desktop → Settings → Developer → Edit Config.</li>
              <li>Add the block below to <code className="font-mono">claude_desktop_config.json</code>. If it already has <code className="font-mono">mcpServers</code>, add only the inner entry.</li>
              <li>Quit Claude Desktop fully and open it again. The tools show up under the connectors button.</li>
            </Steps>
            {card(
              "desktop",
              claudeDesktopConfig(url, token, agent.name),
              "Needs Node 18+ for npx. The token expires in 24h: after Reconnect, copy this again.",
            )}
          </>
        )}

        {tab === "web" && (
          <div className="flex flex-col gap-3 rounded-card border border-line bg-paper-2 px-5 py-4">
            <p className="font-mono text-[14px] tracking-[0.1em] text-ink-3">PLANNED</p>
            <p className="text-[15px] leading-[1.5] text-ink-2">
              claude.ai calls the bridge from Anthropic’s servers and signs in with OAuth. The bridge doesn’t speak OAuth yet, so a custom connector can’t reach it today.
              Use Claude Code or Claude Desktop for now.
            </p>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button type="button" onClick={close} className="min-h-9 cursor-pointer rounded-chip border border-ink px-3.5 text-[14px] font-medium text-ink hover:bg-paper-2">
          Done
        </button>
      </div>
    </Modal>
  );
}
