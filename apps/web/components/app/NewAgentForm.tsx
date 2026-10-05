"use client";

import type { AgentId, AgentType } from "@hive/shared";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { checkAgentName, MAX_AGENT_NAME } from "@/lib/hive/agentName";
import { useGraph } from "@/lib/stores/graph";
import { useSession, type CreateStep } from "@/lib/stores/session";

const chip = "min-h-9 cursor-pointer rounded-chip border px-3 text-[14px] font-medium";

const STEP_TEXT: Record<CreateStep, string> = {
  registering: "Registering on Monad (2 transactions)…",
  loading: "Reading it back from Monad…",
  authorizing: "Authorizing with the bridge…",
};

/** Names and registers one more agent. Used on Connect (type fixed by its tab) and on the canvas (type chosen here). */
export function NewAgentForm({ type, onCreated, onCancel }: { type?: AgentType; onCreated(agentId: AgentId): void; onCancel(): void }) {
  const createAgent = useSession((s) => s.createAgent);
  const [picked, setPicked] = useState<AgentType>(type ?? "claude");
  const [name, setName] = useState("");
  const [step, setStep] = useState<CreateStep>();
  const [error, setError] = useState<string>();
  const agentType = type ?? picked;
  const label = agentType === "gpt" ? "GPT" : "Claude";

  async function submit() {
    const checked = checkAgentName(name, Object.values(useGraph.getState().agents).map((a) => a.name));
    if ("error" in checked) return setError(checked.error);
    setError(undefined);
    setStep("registering");
    try {
      const id = await createAgent(checked.name, agentType, setStep);
      setName("");
      onCreated(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the agent.");
    } finally {
      setStep(undefined);
    }
  }

  return (
    <form className="flex w-full flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      {!type && (
        <div className="flex w-full gap-2" role="group" aria-label="Agent type">
          {(["claude", "gpt"] as const).map((t) => (
            <button
              key={t}
              type="button"
              disabled={step !== undefined}
              aria-pressed={picked === t}
              onClick={() => setPicked(t)}
              className={cn(chip, picked === t ? "border-ink bg-paper-2 text-ink" : "border-line text-ink-2 hover:border-ink-3")}
            >
              {t === "gpt" ? "GPT" : "Claude"}
            </button>
          ))}
        </div>
      )}
      <label className="sr-only" htmlFor="new-agent-name">Agent name</label>
      <input
        id="new-agent-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={MAX_AGENT_NAME}
        placeholder={`${label} · backend`}
        autoFocus
        disabled={step !== undefined}
        className="min-h-9 min-w-0 flex-1 rounded-chip border border-line bg-paper px-3 text-[14px] text-ink disabled:opacity-60"
      />
      <button type="submit" disabled={step !== undefined} className={cn(chip, "border-ink text-ink hover:bg-paper-2 disabled:opacity-50")}>
        {step ? "Creating…" : "Create"}
      </button>
      <button type="button" disabled={step !== undefined} onClick={onCancel} className={cn(chip, "border-line text-ink-2 disabled:opacity-50")}>
        Cancel
      </button>
      <p className="w-full text-[13px] leading-[1.45] text-ink-3" aria-live="polite">
        {step ? `${STEP_TEXT[step]} You can reload: an unfinished agent is finished later with one click.` : "Registering is two transactions. Your account pays a little gas."}
      </p>
      {error && <p role="alert" className="w-full text-[14px] leading-[1.45] text-status-revoked">{error}</p>}
    </form>
  );
}
