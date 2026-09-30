"use client";

import type { AgentType } from "@hive/shared";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { InstallCard } from "@/components/ui/InstallCard";
import { PillButton } from "@/components/ui/Pill";
import { StatusDot } from "@/components/ui/StatusDot";
import { Tabs } from "@/components/ui/Tabs";
import { cn } from "@/lib/cn";
import { useGraph } from "@/lib/stores/graph";
import { useSession, type Connection } from "@/lib/stores/session";

type Tab = "claude" | "gpt";

const AGENTS: Record<Tab, { name: string; type: AgentType; icon: string }> = {
  claude: { name: "Claude", type: "claude", icon: "/agents/claude.png" },
  gpt: { name: "GPT", type: "gpt", icon: "/agents/gpt.png" },
};

// rules O5 / design D4: hive_whoami replaces hive_register_agent (the browser registers agents).
const TOOLS = [
  ["hive_write_memory", "save a memory under a topic"],
  ["hive_read_memory", "read what your edges allow"],
  ["hive_whoami", "check this agent’s identity and what it can read"],
] as const;

const claudeCommand = (url: string, token: string) =>
  [`claude mcp add --transport http hive \\`, `  ${url} \\`, `  --header "Authorization: Bearer ${token}"`].join("\n");

// OpenAI Responses API with a remote MCP tool (rules O7 option b, design D11). The model comes from the env, never hardcoded.
const gptSnippet = (url: string, token: string) =>
  [
    `await openai.responses.create({`,
    `  model: process.env.OPENAI_MODEL,`,
    `  tools: [{ type: "mcp", server_label: "hive",`,
    `    server_url: "${url}",`,
    `    authorization: "${token}",`,
    `    require_approval: "never" }],`,
    `  input: "What do you remember about my work?",`,
    `});`,
  ].join("\n");

const gptRunner = (token: string) => `HIVE_TOKEN_GPT=${token} pnpm --filter @hive/agents gpt --chat`;

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

const ago = (seconds: number) => (seconds < 60 ? `${Math.max(0, seconds)}s ago` : `${Math.floor(seconds / 60)}m ago`);

function pendingText(name: string, conn: Connection | undefined, graphReady: boolean): string | undefined {
  if (!graphReady) return "Loading your agents…";
  if (!conn || conn.phase === "authorizing") return `Creating ${name}’s scoped key…`;
  if (conn.phase === "registering") return `Registering ${name} on Monad…`;
  return undefined;
}

function Step({ badge, active, done, children }: { badge: string; active?: boolean; done?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3.5">
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-full font-mono text-[14px] font-medium",
          done ? "bg-ink text-paper" : active ? "border-[1.5px] border-amber-strong bg-paper-2 text-ink" : "bg-paper-2 text-ink",
        )}
        aria-hidden="true"
      >
        {done ? "✓" : badge}
      </span>
      <span className={cn("text-[16px] whitespace-pre-wrap", done ? "text-ink" : active ? "font-medium text-ink" : "text-ink-3")}>{children}</span>
    </li>
  );
}

export default function ConnectPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("claude");
  const graphReady = useGraph((s) => s.status === "ready");
  const agents = useGraph((s) => s.agents);
  const connections = useSession((s) => s.connections);
  const connectAgent = useSession((s) => s.connectAgent);
  const now = useNow();

  // Set up the agent behind the open tab: register if needed, then authorize (rules §6, Connect rows).
  useEffect(() => {
    if (graphReady) void connectAgent(AGENTS[tab].type, AGENTS[tab].name);
  }, [graphReady, tab, connectAgent]);

  const byType = (t: AgentType) => Object.values(agents).find((a) => a.agentType === t);
  const connectedCount = (["claude", "gpt"] as const).filter((t) => byType(AGENTS[t].type)?.connected).length;

  const agent = AGENTS[tab];
  const conn = connections[agent.type];
  const ready = conn?.phase === "ready" ? conn : undefined;
  const token = ready?.agentToken ?? "";
  const url = ready?.mcpUrl ?? "";

  return (
    <main className="relative mx-auto grid w-full max-w-[1200px] items-start gap-12 px-8 pt-[140px] pb-16 xl:grid-cols-[minmax(0,520px)_600px] xl:justify-between xl:pt-[184px]">
      <div className="flex flex-col items-start gap-6">
        <p className="flex items-center gap-2.5 text-[15px] text-ink-3">
          Works with
          <Image src="/agents/claude.png" alt="Claude" width={18} height={18} />
          <Image src="/agents/gpt.png" alt="GPT" width={18} height={18} />
        </p>
        <h1 className="font-display text-[clamp(48px,4.45vw,64px)] leading-none tracking-[-0.018em] text-ink">
          Connect your
          <br />
          first <em className="text-amber-strong">two</em> agents.
        </h1>
        <p className="max-w-[500px] text-[18px] leading-[1.55] text-ink-2">
          Hive is one MCP server. Add it to Claude and GPT once, and memory moves between them only along the edges you sign.
        </p>
        <ol className="flex flex-col gap-3.5">
          <Step badge="1" done>Your passkey is verified</Step>
          <Step badge="2" active={connectedCount < 2} done={connectedCount === 2}>
            Run the command for each agent{connectedCount > 0 ? `  ·  ${connectedCount} of 2` : ""}
          </Step>
          <Step badge="3">Draw an edge on the canvas</Step>
        </ol>
        <a
          href="https://modelcontextprotocol.io/docs/getting-started/intro"
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-9 items-center text-[15px] font-medium whitespace-pre text-ink underline underline-offset-2 hover:text-ink-2"
        >
          Read the MCP docs  →
        </a>
      </div>

      <div className="flex w-full flex-col items-start gap-4">
        <Tabs<Tab>
          label="Agent"
          idPrefix="connect"
          value={tab}
          onChange={setTab}
          items={[
            { key: "claude", label: "Claude", icon: AGENTS.claude.icon },
            { key: "gpt", label: "GPT", icon: AGENTS.gpt.icon },
          ]}
        />
        <div id="connect-panel" role="tabpanel" aria-labelledby={`connect-tab-${tab}`} className="w-full">
          <InstallCard
            tab={tab}
            command={tab === "claude" ? claudeCommand(url, token) : gptSnippet(url, token)}
            token={token}
            pending={pendingText(agent.name, conn, graphReady)}
            error={conn?.phase === "error" ? conn.message : undefined}
            onRetry={() => void connectAgent(agent.type, agent.name)}
            secondary={tab === "gpt" && token ? { caption: "or run Hive’s GPT agent (planned: apps/agents)", command: gptRunner(token) } : undefined}
            note={
              tab === "claude"
                ? "Your token is already filled in. It is scoped to this one agent and expires in 24h."
                : "A separate token from Claude’s, so one leak can’t act as the other. OpenAI calls the bridge from its servers, so this URL must be public."
            }
          />
        </div>

        <div className="flex w-full flex-col gap-2 pt-1.5 text-[14px]">
          <p className="font-mono tracking-[0.1em] text-ink-3">ADDS 3 TOOLS</p>
          <ul className="flex flex-col gap-2">
            {TOOLS.map(([name, what]) => (
              <li key={name} className="flex gap-3.5">
                <code className="w-[190px] shrink-0 font-mono text-ink">{name}</code>
                <span className="text-ink-2">{what}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex w-full flex-wrap items-center justify-between gap-4 border-t border-line pt-[18px]">
          <ul className="flex flex-col gap-1.5" aria-live="polite">
            {(["claude", "gpt"] as const).map((t) => {
              const a = byType(AGENTS[t].type);
              const c = connections[AGENTS[t].type];
              return (
                <li key={t} className="flex items-center gap-2 text-[14px]">
                  <StatusDot status={a?.connected ? "active" : "idle"} />
                  <span className="font-medium text-ink">{AGENTS[t].name}</span>
                  <span className={cn("font-mono whitespace-pre", a?.connected ? "text-status-active" : "text-ink-3")}>
                    {a?.connected
                      ? `connected  ·  first call ${ago(now - (a.lastCallAt ?? now))}`
                      : c?.phase === "ready"
                        ? "waiting for first call…"
                        : "not set up yet"}
                  </span>
                </li>
              );
            })}
          </ul>
          <PillButton disabled={connectedCount === 0} onClick={() => router.push("/canvas")}>
            Open the canvas
          </PillButton>
        </div>
        <Link href="/canvas" className="inline-flex min-h-9 items-center text-[14px] text-ink-2 underline underline-offset-2 hover:text-ink">
          Skip, I’ll connect them later
        </Link>
      </div>
    </main>
  );
}
