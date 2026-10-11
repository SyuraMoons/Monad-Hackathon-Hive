"use client";

import { codexConfig, codexEnv, connectorUrl, gptSnippet } from "@/lib/hive/commands";
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
          <li>Add this block to <code className="font-mono">~/.codex/config.toml</code> (create the file if it doesn’t exist).</li>
          <li>In the terminal where you run Codex, set the token below, then start <code className="font-mono">codex</code> from that same terminal. Codex loads MCP servers at startup.</li>
        </Steps>
        {card(
          "codex",
          codexConfig(url, name),
          "The file holds only the name of the token variable, never the token. The token is scoped to this agent and expires in 24h: after Reconnect, export it again and restart Codex.",
          token ? { caption: "then, in that terminal", command: codexEnv(token, name) } : undefined,
        )}
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
