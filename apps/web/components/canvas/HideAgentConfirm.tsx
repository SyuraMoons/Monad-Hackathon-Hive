"use client";

import { useState } from "react";
import { PillButton } from "@/components/ui/Pill";
import { Popover } from "@/components/ui/Popover";
import { removeAgent } from "@/lib/agentActions";
import { displayName, useGraph } from "@/lib/stores/graph";
import { useUi, type Anchor } from "@/lib/stores/ui";

// Same words as the drawer's remove section (ADR-012): hiding is local, the agent stays registered on Monad.
export function HideAgentConfirm({ agentId, at }: { agentId: string; at: Anchor }) {
  const agent = useGraph((s) => s.agents[agentId]);
  const labels = useGraph((s) => s.labels);
  const setUi = useUi((s) => s.set);
  const [error, setError] = useState<string>();
  if (!agent) return null;
  const name = displayName(agent, labels);
  const close = () => setUi({ hideAgent: null });

  async function hide() {
    const result = await removeAgent(agent.agentId);
    if ("error" in result) setError(result.error);
    else close();
  }

  return (
    <Popover
      role="alertdialog"
      label={`Hide ${name}`}
      onClose={close}
      autoFocusSelector="[data-autofocus]"
      className="flex w-[330px] flex-col gap-3 rounded-menu border border-status-revoked bg-paper px-[20px] py-[18px] shadow-[0_10px_24px_rgb(0_0_0/0.16)]"
      style={{ position: "fixed", left: at.x, top: at.y }}
    >
      <p className="font-mono text-[14px] tracking-[0.1em] text-status-revoked">HIDE AGENT</p>
      <h2 className="truncate font-display text-[22px] leading-tight text-ink">{name}</h2>
      <p className="text-[15px] leading-[1.5] text-ink-2">
        {name} leaves your canvas and its bridge session ends. It stays registered on Monad, and you can show it again from the sidebar.
      </p>
      {error && <p role="alert" className="text-[14px] leading-[1.45] text-status-revoked">{error}</p>}
      <div className="flex items-center justify-between gap-4">
        <button type="button" data-autofocus onClick={close} className="min-h-9 cursor-pointer text-[15px] font-medium text-ink-2 underline underline-offset-2 hover:text-ink">
          Keep agent
        </button>
        <PillButton variant="danger" onClick={() => void hide()}>Hide agent</PillButton>
      </div>
    </Popover>
  );
}
