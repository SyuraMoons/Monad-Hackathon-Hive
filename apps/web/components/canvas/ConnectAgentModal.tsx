"use client";

import { useState } from "react";
import { zeroAddress } from "viem";
import { ConnectGuide } from "@/components/connect/ConnectGuide";
import { Modal } from "@/components/ui/Modal";
import { hasGuide, PRODUCT } from "@/lib/hive/agentTypes";
import { useGraph } from "@/lib/stores/graph";
import { useSession } from "@/lib/stores/session";
import { useUi } from "@/lib/stores/ui";

/** Centered "Connect to Claude / ChatGPT / DeepSeek" dialog, opened from the agent drawer and the sidebar menu. */
export function ConnectAgentModal({ agentId }: { agentId: string }) {
  const agent = useGraph((s) => s.agents[agentId]);
  const authorization = useSession((s) => s.authorizations[agentId]);
  const locked = useSession((s) => s.status === "signed-in" && !s.keys);
  const authorizeAgent = useSession((s) => s.authorizeAgent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const close = () => useUi.getState().set({ connectAgent: null });

  if (!agent || !hasGuide(agent.agentType)) return null;
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

  // The token tabs need the agent's token: without one the card asks for the passkey instead of showing a command.
  const missing = !token
    ? error ?? (unfinished
      ? `${agent.name} was registered, but its setup stopped halfway. Finishing is one transaction.`
      : `${agent.name} has no token in this tab. ${locked ? "Unlock with your passkey to create one." : "Authorize it to show the command."}`)
    : undefined;

  return (
    <Modal labelledBy="connect-agent-title" onClose={close} dismissible={!busy}>
      <div className="flex flex-col gap-1.5">
        <p className="font-mono text-[14px] tracking-[0.1em] text-ink-3">CONNECT</p>
        <h2 id="connect-agent-title" className="font-display text-[32px] leading-tight text-ink">Connect {agent.name} to {PRODUCT[agent.agentType]}</h2>
      </div>

      <ConnectGuide
        key={agent.agentType}
        type={agent.agentType}
        name={agent.name}
        url={url}
        token={token}
        idPrefix="connect-agent"
        status={{
          pending: busy ? "Waiting for your passkey…" : undefined,
          error: missing,
          retryLabel: unfinished ? "Finish setup" : locked ? "Unlock with passkey" : "Authorize",
          onRetry: () => void authorize(),
        }}
      />

      <div className="flex justify-end">
        <button type="button" onClick={close} className="min-h-9 cursor-pointer rounded-chip border border-ink px-3.5 text-[14px] font-medium text-ink hover:bg-paper-2">
          Done
        </button>
      </div>
    </Modal>
  );
}
