"use client";

import { codexCommand, codexConfig, connectorUrl, gptSnippet, nameSlug } from "@/lib/hive/commands";
import { ConnectorUrl, Fine, Prose, Steps, type GuideBodyProps } from "./parts";

export const GPT_TABS = [
  { key: "chatgpt", label: "ChatGPT" },
  { key: "codex", label: "Codex CLI" },
  { key: "api", label: "OpenAI API" },
];

// ChatGPT calls the bridge from OpenAI's servers and signs in with OAuth, like claude.ai (ADR-019). Not yet run against a real ChatGPT.
export function GptGuide({ name, url, token, tab, card }: GuideBodyProps) {
  if (tab === "chatgpt") {
    return (
      <>
        <Steps>
          <li>In ChatGPT, open Plugins (chatgpt.com/plugins), click +, then Add custom MCP server.</li>
          <li>Give it a name (<code className="font-mono">Hive</code>) and a short description. Under Connection, paste this URL.</li>
          <li>For authentication choose OAuth and leave any client ID or secret empty.</li>
          <li>Confirm “I understand and want to continue”, then create it. Hive opens: sign in with your passkey and choose <strong className="font-medium text-ink">{name}</strong>.</li>
          <li>In a chat, type <code className="font-mono">@</code> and pick Hive.</li>
        </Steps>
        <ConnectorUrl url={connectorUrl(url, process.env.NEXT_PUBLIC_BRIDGE_URL)} provider="OpenAI" />
        <Fine>
          One connector is one agent: to use another agent, remove the connector in ChatGPT and add it again. When the bridge restarts or after 24h, ChatGPT asks you to sign in again. Your workspace may block custom MCP servers, and ChatGPT’s menus change: if you don’t see Plugins, look under Settings for Apps or Connectors. Memories this agent reads are sent to OpenAI. Planned: not yet run against a live ChatGPT.
        </Fine>
      </>
    );
  }

  if (tab === "codex") {
    return (
      <>
        <Steps>
          <li>Paste this in a terminal. It adds Hive to <code className="font-mono">~/.codex/config.toml</code>, so it works from any terminal and folder.</li>
          <li>Start <code className="font-mono">codex</code> and type <code className="font-mono">/mcp</code>: <code className="font-mono">hive-{nameSlug(name)}</code> should show as connected.</li>
        </Steps>
        {card(
          "codex",
          codexCommand(url, token, name),
          "The token is saved in ~/.codex/config.toml on this computer. It is scoped to this agent and expires in 24h: after Reconnect, paste the new command and start a new Codex session. If /mcp shows failed, the bridge restarted or the token expired: Reconnect and paste again. Don’t run codex mcp add for this server, it erases the token.",
          { caption: "or add this to ~/.codex/config.toml by hand (Windows)", command: codexConfig(url, token, name) },
        )}
        <Fine>A new agent reads nothing until you draw an edge to it on the canvas. Codex CLI only: the Codex desktop app and IDE extension have their own MCP settings.</Fine>
      </>
    );
  }

  return (
    <>
      <Prose>For developers: the OpenAI Responses API can call Hive as a remote MCP tool. Its servers make the call, so the bridge URL must be public.</Prose>
      {card(
        "gpt",
        gptSnippet(url, token),
        "A separate token from Claude’s, so one leak can’t act as the other. Set OPENAI_MODEL to the model you use. The token expires in 24h.",
      )}
    </>
  );
}
