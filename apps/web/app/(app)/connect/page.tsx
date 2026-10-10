"use client";

import { zeroAddress } from "viem";
import type { AgentType } from "@hive/shared";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NewAgentForm } from "@/components/app/NewAgentForm";
import { InstallCard } from "@/components/ui/InstallCard";
import { PillButton } from "@/components/ui/Pill";
import { StatusDot } from "@/components/ui/StatusDot";
import { Tabs } from "@/components/ui/Tabs";
import { cn } from "@/lib/cn";
import { claudeCommand, claudeTerminalCommand, deepseekRunner, gptRunner, gptSnippet } from "@/lib/hive/commands";
import { useGraph, visibleAgents } from "@/lib/stores/graph";
import { useSession, type Connection } from "@/lib/stores/session";

type Tab = "claude" | "gpt" | "deepseek";

const AGENTS: Record<Tab, { name: string; type: AgentType; icon?: string }> = {
  claude: { name: "Claude", type: "claude", icon: "/agents/claude.png" },
  gpt: { name: "GPT", type: "gpt", icon: "/agents/gpt.png" },
  deepseek: { name: "DeepSeek", type: "deepseek", icon: "/agents/deepseek.png" },
};

// rules O5 / design D4: hive_whoami replaces hive_register_agent (the browser registers agents).
const TOOLS = [
  ["hive_write_memory", "save a memory under a topic"],
  ["hive_save_session", "save a summary of this conversation to Hive"],
  ["hive_list_memory", "list what your edges allow, with a short preview"],
  ["hive_read_memory", "read the full memories you pick"],
  ["hive_whoami", "check this agent’s identity and what it can read"],
] as const;

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

const chip = "min-h-9 cursor-pointer rounded-chip border px-3 text-[14px] font-medium";

export default function ConnectPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("claude");
  const graphReady = useGraph((s) => s.status === "ready");
  const graphError = useGraph((s) => (s.status === "error" ? (s.error ?? "Could not load your agents.") : undefined));
  const allAgents = useGraph((s) => s.agents);
  const hidden = useGraph((s) => s.hidden);
  const agents = visibleAgents(allAgents, hidden);
  const owner = useSession((s) => s.owner);
  const connections = useSession((s) => s.connections);
  const authorizations = useSession((s) => s.authorizations);
  const connectAgent = useSession((s) => s.connectAgent);
  const authorizeAgent = useSession((s) => s.authorizeAgent);
  const locked = useSession((s) => s.status === "signed-in" && !s.keys);
  const unlock = useSession((s) => s.unlock);
  const [actionError, setActionError] = useState<string>();
  const [picked, setPicked] = useState<string>();
  const [naming, setNaming] = useState(false);
  const now = useNow();

  // Set up the first agent of the open tab: register if needed, then authorize (rules §6, Connect rows).
  useEffect(() => {
    if (graphReady && !locked) void connectAgent(AGENTS[tab].type, AGENTS[tab].name);
  }, [graphReady, locked, tab, connectAgent]);

  const ofType = (t: AgentType) => Object.values(agents).filter((a) => a.agentType === t).sort((a, b) => Number(a.agentId - b.agentId));
  const all = [...ofType("claude"), ...ofType("gpt"), ...ofType("deepseek")];
  const connectedCount = all.filter((a) => a.connected).length;

  const agent = AGENTS[tab];
  const mine = ofType(agent.type);
  const allHidden = mine.length === 0 && Object.values(allAgents).some((a) => a.agentType === agent.type);
  const selected = mine.find((a) => a.agentId.toString() === picked) ?? mine[0];
  const isDefault = selected === mine[0];
  const conn = isDefault ? connections[agent.type] : undefined;
  const auth = selected ? authorizations[selected.agentId.toString()] : undefined;
  const token = auth?.agentToken ?? "";
  const url = auth?.mcpUrl ?? "";
  const needsAuthorize = !!selected && !auth && !locked && (!isDefault || conn?.phase === "error" || conn?.phase === "ready");
  // A saved token keeps its command on screen after a reload: the passkey is asked only when something needs the keys.
  const needsUnlock = locked && !token;
  const unfinished = !!selected && selected.agentKey === zeroAddress;

  function switchTab(next: Tab) {
    setTab(next);
    setPicked(undefined);
    setNaming(false);
    setActionError(undefined);
  }

  const fail = (e: unknown, fallback: string) => setActionError(e instanceof Error ? e.message : fallback);

  return (
    <main className="relative mx-auto grid w-full max-w-[1200px] items-start gap-12 px-8 pt-[140px] pb-16 xl:grid-cols-[minmax(0,520px)_600px] xl:justify-between xl:pt-[184px]">
      <div className="flex flex-col items-start gap-6">
        <p className="flex items-center gap-2.5 text-[15px] text-ink-3">
          Works with
          <Image src="/agents/claude.png" alt="Claude" width={18} height={18} />
          <Image src="/agents/gpt.png" alt="GPT" width={18} height={18} />
          <image src="/agents/deepseek.png" alt="DeepSeek" width={18} height={18} />
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
          <Step badge="2" active={connectedCount < 2} done={connectedCount >= 2}>
            Run the command for each agent{connectedCount > 0 ? `  ·  ${connectedCount} connected` : ""}
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
          onChange={switchTab}
          items={[
            { key: "claude", label: "Claude", icon: AGENTS.claude.icon },
            { key: "gpt", label: "GPT", icon: AGENTS.gpt.icon },
            { key: "deepseek", label: "DeepSeek" },
          ]}
        />

        <div className="flex w-full flex-wrap items-center gap-2" role="group" aria-label={`${agent.name} agents`}>
          {mine.map((a) => (
            <button
              key={a.agentId.toString()}
              type="button"
              onClick={() => { setPicked(a.agentId.toString()); setActionError(undefined); }}
              aria-pressed={a === selected}
              className={cn(chip, a === selected ? "border-ink bg-paper-2 text-ink" : "border-line text-ink-2 hover:border-ink-3")}
            >
              {a.name}
            </button>
          ))}
          {selected && !naming && (
            <button type="button" onClick={() => setNaming(true)} disabled={needsUnlock} className={cn(chip, "border-dashed border-clay text-ink-2 hover:text-ink disabled:cursor-default disabled:opacity-50")}>
              + New {agent.name} agent
            </button>
          )}
        </div>
        {naming && (
          <NewAgentForm
            type={agent.type}
            onCancel={() => { setNaming(false); setActionError(undefined); }}
            onCreated={(id) => { setPicked(id.toString()); setNaming(false); setActionError(undefined); }}
          />
        )}

        <div id="connect-panel" role="tabpanel" aria-labelledby={`connect-tab-${tab}`} className="w-full">
          <InstallCard
            tab={tab}
            command={tab === "claude" ? claudeTerminalCommand(url, token, selected?.name ?? agent.name) : tab === "deepseek" ? deepseekRunner(url, token) : gptSnippet(url, token)}
            token={token}
            pending={token || graphError || needsUnlock || needsAuthorize || allHidden ? undefined : pendingText(agent.name, conn, graphReady)}
            error={
              graphError ??
              actionError ??
              (needsUnlock
                ? `Unlock with your passkey to set up ${selected?.name ?? agent.name}.`
                : allHidden
                  ? `All your ${agent.name} agents are hidden. Show one again from the canvas sidebar.`
                  : needsAuthorize
                  ? unfinished
                    ? `${selected?.name} was registered, but its setup stopped halfway. Finishing is one transaction.`
                    : `${selected?.name} has no token in this tab. Authorize it to show the command.`
                  : conn?.phase === "error"
                    ? conn.message
                    : undefined)
            }
            retryLabel={!graphError && needsUnlock ? "Unlock with passkey" : needsAuthorize ? (unfinished ? "Finish setup" : "Authorize") : undefined}
            onRetry={() =>
              void (graphError && owner
                ? useGraph.getState().load(owner)
                : needsUnlock
                  ? unlock().then(() => setActionError(undefined), (e: unknown) => fail(e, "Could not unlock with the passkey."))
                  : needsAuthorize && selected
                    ? authorizeAgent(selected.agentId).then(() => setActionError(undefined), (e: unknown) => fail(e, "Could not authorize the agent."))
                    : connectAgent(agent.type, agent.name))
            }
            secondary={
              token && tab !== "deepseek"
                ? tab === "gpt"
                  ? { caption: "or run Hive’s GPT agent (planned: apps/agents)", command: gptRunner(token) }
                  : { caption: "or save it for the whole folder: every Claude Code session in it becomes this agent", command: claudeCommand(url, token) }
                : undefined
            }
            note={
              tab === "deepseek"
                ? "Run this from the repo, with DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL and DEEPSEEK_MODEL in .env. The runner calls the bridge for DeepSeek, so a local bridge works. Memories this agent reads are sent to DeepSeek’s API. Planned: not yet run against testnet."
                : tab === "claude"
                ? "Run this in your project folder. Only that terminal is this agent, so several agents can share one folder, one terminal each. The token is scoped to this agent and expires in 24h. Don’t also save it for the folder: run claude mcp remove hive first."
                : "A separate token from Claude’s, so one leak can’t act as the other. OpenAI calls the bridge from its servers, so this URL must be public."
            }
          />
        </div>

        <div className="flex w-full flex-col gap-2 pt-1.5 text-[14px]">
          <p className="font-mono tracking-[0.1em] text-ink-3">ADDS {TOOLS.length} TOOLS</p>
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
            {(all.length ? all : []).map((a) => (
              <li key={a.agentId.toString()} className="flex items-center gap-2 text-[14px]">
                <StatusDot status={a.connected ? "active" : "idle"} />
                <span className="font-medium text-ink">{a.name}</span>
                <span className={cn("font-mono whitespace-pre", a.connected ? "text-status-active" : "text-ink-3")}>
                  {a.connected
                    ? `connected  ·  first call ${ago(now - (a.lastCallAt ?? now))}`
                    : a.tokenExpiresAt && a.tokenExpiresAt > now
                      ? "waiting for first call…"
                      : "not set up yet"}
                </span>
              </li>
            ))}
            {all.length === 0 && <li className="font-mono text-[14px] text-ink-3">{graphReady ? "no agents yet" : "Loading your agents from Monad…"}</li>}
          </ul>
          <PillButton disabled={all.length === 0} onClick={() => router.push("/canvas")}>
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
