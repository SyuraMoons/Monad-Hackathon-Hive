"use client";

import { aiConnectPrompt, aiDesktopPrompt, claudeCommand, claudeDesktopConfig, claudeTerminalCommand, connectorUrl } from "@/lib/hive/commands";
import { ConnectorUrl, Fine, Prose, Steps, type GuideBodyProps } from "./parts";

export const CLAUDE_TABS = [
  { key: "code", label: "Claude Code" },
  { key: "desktop", label: "Claude Desktop" },
  { key: "web", label: "Claude.ai" },
];

// claude.ai, Claude Desktop and the mobile app share one connector. There is no token to paste: Claude opens Hive's sign-in (ADR-019).
export function ClaudeGuide({ name, url, token, tab, card }: GuideBodyProps) {
  if (tab === "code") {
    return card(
      "claude",
      claudeTerminalCommand(url, token, name),
      "Run this in your project folder. Only that terminal is this agent, so several agents can share one folder, one terminal each. The token is scoped to this agent and expires in 24h.",
      token ? { caption: "or save it for the whole folder: every Claude Code session in it becomes this agent", command: claudeCommand(url, token) } : undefined,
    );
  }

  if (tab === "desktop") {
    return (
      <>
        <Prose>Easiest: add Hive as a connector (see the Claude.ai tab, it works in Claude Desktop too). Or run it with this agent’s token:</Prose>
        <Steps>
          <li>Open Claude Desktop → Settings → Developer → Edit Config.</li>
          <li>Add the block below to <code className="font-mono">claude_desktop_config.json</code>. If it already has <code className="font-mono">mcpServers</code>, add only the inner entry.</li>
          <li>Quit Claude Desktop fully and open it again. The tools show up under the connectors button.</li>
        </Steps>
        {card("desktop", claudeDesktopConfig(url, token, name), "Needs Node 18+ for npx. The token expires in 24h: after Reconnect, copy this again.")}
        {token && (
          <>
            <Prose>Or paste this to an AI that can edit files (Claude Code, Cursor, Codex) and it adds the config for you:</Prose>
            {card("ai", aiDesktopPrompt(url, token, name), "Pasting this sends the token to that AI’s provider. It is scoped to this agent and expires in 24h. Restart Claude Desktop afterwards.")}
          </>
        )}
      </>
    );
  }

  return (
    <>
      <Steps>
        <li>In Claude, open Settings → Connectors → Add custom connector.</li>
        <li>Name it <code className="font-mono">Hive</code> and paste this URL. Leave any OAuth client fields empty.</li>
        <li>Click Connect. Hive opens: sign in with your passkey and choose <strong className="font-medium text-ink">{name}</strong>.</li>
      </Steps>
      <ConnectorUrl url={connectorUrl(url, process.env.NEXT_PUBLIC_BRIDGE_URL)} provider="Claude" />
      <Fine>
        One connector is one agent: to use another agent, remove the connector in Claude and add it again. When the bridge restarts or after 24h, Claude asks you to sign in again. A free Claude plan allows one custom connector.
      </Fine>
      {token && (
        <>
          <Prose>Or paste this to an AI that can run commands (Claude Code, Cursor, Codex) and it connects itself:</Prose>
          {card("ai", aiConnectPrompt(url, token, name), "A chat-only AI can’t run this: use the connector above. Pasting this sends the token to that AI’s provider. It is scoped to this agent and expires in 24h.")}
        </>
      )}
    </>
  );
}
