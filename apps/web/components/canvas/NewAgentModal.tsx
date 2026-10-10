"use client";

import type { AgentId } from "@hive/shared";
import { useState } from "react";
import { NewAgentForm } from "@/components/app/NewAgentForm";
import { Modal } from "@/components/ui/Modal";
import { useUi } from "@/lib/stores/ui";

/** Centered "New agent" dialog; the canvas behind it is blurred by the Modal scrim. */
export function NewAgentModal({ onCreated }: { onCreated(agentId: AgentId): void }) {
  const [busy, setBusy] = useState(false);
  const close = () => useUi.getState().set({ newAgent: false });
  return (
    <Modal labelledBy="new-agent-title" onClose={close} dismissible={!busy}>
      <div className="flex flex-col gap-1.5">
        <p className="font-mono text-[14px] tracking-[0.1em] text-ink-3">NEW AGENT</p>
        <h2 id="new-agent-title" className="font-display text-[32px] leading-tight text-ink">Register an agent</h2>
      </div>
      <NewAgentForm stacked onBusyChange={setBusy} onCreated={onCreated} onCancel={close} />
    </Modal>
  );
}
