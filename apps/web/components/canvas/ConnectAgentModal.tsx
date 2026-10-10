"use client";

import { useState, type ReactNode } from "react";
import { zeroAddress } from "viem";
import { InstallCard, type InstallTab } from "@/components/ui/InstallCard";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { aiConnectPrompt, aiDesktopPrompt, claudeCommand, claudeDesktopConfig, claudeTerminalCommand, connectorUrl, isLocalUrl } from "@/lib/hive/commands";
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

function CopyUrl({ url }: { url: string }) {
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

// claude.ai, Claude Desktop and the mobile app share one connector. There is no token to paste: Claude opens Hive's sign-in (ADR-019).
function WebSteps({ url, name }: { url: string; name: string }) {
  if (!url) return <p className="text-[15px] leading-[1.5] text-ink-2">The app doesn’t know where the bridge is (NEXT_PUBLIC_BRIDGE_URL is not set).</p>;
  return (
    <>
      <Steps>
        <li>In Claude, open Settings → Connectors → Add custom connector.</li>
        <li>Name it <code className="font-mono">Hive</code> and paste this URL. Leave any OAuth client fields empty.</li>
        <li>Click Connect. Hive opens: sign in with your passkey and choose <strong className="font-medium text-ink">{name}</strong>.</li>
      </Steps>
      <CopyUrl url={url} />
      {isLocalUrl(url) && (
        <p role="alert" className="text-[14px] leading-[1.45] text-status-revoked">
          This is a local address. Claude calls it from Anthropic’s servers, so it only works once the bridge is deployed on a public URL.
        </p>
      )}
      <p className="text-[14px] leading-[1.5] text-ink-2">
        One connector is one agent: to use another agent, remove the connector in Claude and add it again. When the bridge restarts or after 24h, Claude asks you to sign in again. A free Claude plan allows one custom connector.
      </p>
    </>
  );
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
            <p className="text-[15px] leading-[1.5] text-ink-2">
              Easiest: add Hive as a connector (see the Claude.ai tab, it works in Claude Desktop too). Or run it with this agent’s token:
            </p>
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
            <p className="text-[15px] leading-[1.5] text-ink-2">
              Or paste this to an AI that can edit files (Claude Code, Cursor, Codex) and it adds the config for you:
            </p>
            {card(
              "ai",
              aiDesktopPrompt(url, token, agent.name),
              "The token is scoped to this agent and expires in 24h. Restart Claude Desktop afterwards.",
            )}
          </>
        )}

        {tab === "web" && (
          <>
            <WebSteps url={connectorUrl(url, process.env.NEXT_PUBLIC_BRIDGE_URL)} name={agent.name} />
            <p className="text-[15px] leading-[1.5] text-ink-2">
              Or paste this to an AI that can run commands (Claude Code, Cursor, Codex) and it connects itself:
            </p>
            {card(
              "ai",
              aiConnectPrompt(url, token, agent.name),
              "A chat-only AI can’t run this: use the connector above. The token is scoped to this agent and expires in 24h.",
            )}
          </>
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
