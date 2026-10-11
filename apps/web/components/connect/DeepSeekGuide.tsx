"use client";

import { deepseekClaudeCommand, deepseekRunner, mcpClientConfig, mcpHttpDetails } from "@/lib/hive/commands";
import { Fine, Prose, Steps, type GuideBodyProps } from "./parts";

export const DEEPSEEK_TABS = [
  { key: "claude", label: "Claude Code CLI" },
  { key: "runner", label: "Hive runner" },
  { key: "mcp", label: "MCP app" },
];

// DeepSeek has no hosted remote-MCP tool, so it can only reach the bridge through something that runs on your computer (ADR-020).
export function DeepSeekGuide({ name, url, token, tab, card }: GuideBodyProps) {
  return (
    <>
      <Prose>
        <strong className="font-medium text-ink">Planned: not yet run against testnet.</strong> DeepSeek has no hosted connector, so it reaches Hive through a program on your computer.
      </Prose>

      {tab === "claude" ? (
        <>
          <Steps>
            <li>Install Claude Code. In your terminal, set <code className="font-mono">DEEPSEEK_API_KEY</code> and <code className="font-mono">DEEPSEEK_MODEL</code> (a model name from DeepSeek’s docs).</li>
            <li>Paste this in that terminal. It starts Claude Code running on DeepSeek, with Hive connected as <strong className="font-medium text-ink">{name}</strong>.</li>
          </Steps>
          {card(
            "claude",
            deepseekClaudeCommand(url, token, name),
            "Nothing is saved: the config lives in this one terminal, so a local bridge works. Memories this agent reads are sent to DeepSeek’s API. The token is scoped to this agent and expires in 24h.",
          )}
        </>
      ) : tab === "runner" ? (
        <>
          <Steps>
            <li>Clone the Hive repo and run <code className="font-mono">corepack enable pnpm</code> then <code className="font-mono">pnpm install</code>. Node 22+ is required.</li>
            <li>In the repo’s <code className="font-mono">.env</code>, set <code className="font-mono">DEEPSEEK_API_KEY</code>, <code className="font-mono">DEEPSEEK_BASE_URL</code> and <code className="font-mono">DEEPSEEK_MODEL</code>.</li>
            <li>Run this from the repo. It starts a chat where DeepSeek can use Hive as <strong className="font-medium text-ink">{name}</strong>.</li>
          </Steps>
          {card(
            "deepseek",
            deepseekRunner(url, token),
            "The runner calls the bridge for DeepSeek, so a local bridge works. Memories this agent reads are sent to DeepSeek’s API. The token is scoped to this agent and expires in 24h.",
          )}
        </>
      ) : (
        <>
          <Steps>
            <li>Use a desktop MCP app that lets you pick DeepSeek as the model and enter your DeepSeek API key.</li>
            <li>Add Hive as an MCP server with the config below. It needs Node 18+ for npx.</li>
            <li>Restart the app, then ask DeepSeek to call <code className="font-mono">hive_whoami</code>.</li>
          </Steps>
          {card(
            "mcp",
            mcpClientConfig(url, token, name),
            "The token expires in 24h: after Reconnect, copy this again. Memories this agent reads are sent to DeepSeek’s API.",
            token ? { caption: "or, if the app takes an HTTP MCP server directly", command: mcpHttpDetails(url, token) } : undefined,
          )}
          <Fine>Which apps support this changes often, so Hive doesn’t name one. The app only needs to run MCP servers and call DeepSeek’s API.</Fine>
        </>
      )}
    </>
  );
}
