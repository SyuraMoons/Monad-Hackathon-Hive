"use client";

import { useRef, type KeyboardEvent } from "react";
import { Popover } from "@/components/ui/Popover";
import { displayName, useGraph } from "@/lib/stores/graph";
import { useUi, type Anchor } from "@/lib/stores/ui";

const item = "flex min-h-9 w-full cursor-pointer items-center px-3.5 py-[9px] text-left text-[15px] text-ink hover:bg-paper-2 focus-visible:bg-paper-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:text-ink-3 disabled:hover:bg-transparent";
const W = 240;
const H = 230;

/** Keeps a fixed popover inside the window. */
export const clampToViewport = (at: Anchor, w = W, h = H): Anchor => ({
  x: Math.max(8, Math.min(at.x, window.innerWidth - w - 8)),
  y: Math.max(8, Math.min(at.y, window.innerHeight - h - 8)),
});

/** Right-click menu of a sidebar agent chip. Fixed, because the sidebar scrolls and would clip an absolute popover. */
export function AgentMenu({ agentId, at, placed, onPrimary, onEditLabel, onTakeOff }: {
  agentId: string;
  at: Anchor;
  placed: boolean;
  onPrimary(): void;
  onEditLabel(): void;
  onTakeOff(): void;
}) {
  const agent = useGraph((s) => s.agents[agentId]);
  const labels = useGraph((s) => s.labels);
  const linked = useGraph((s) => !!agent && Object.values(s.edges).some((e) => (e.from === agent.agentId || e.to === agent.agentId) && e.state !== "revoked"));
  const setUi = useUi((s) => s.set);
  const list = useRef<HTMLDivElement>(null);
  if (!agent) return null;

  const close = () => setUi({ agentMenu: null });
  const run = (fn: () => void) => () => {
    close();
    fn();
  };

  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  }

  return (
    <Popover
      role="menu"
      label={`Actions for ${displayName(agent, labels)}`}
      onClose={close}
      className="w-60 rounded-card border border-ink bg-paper py-1.5 shadow-menu"
      style={{ position: "fixed", left: at.x, top: at.y }}
    >
      <div ref={list} onKeyDown={onKeyDown}>
        <button type="button" role="menuitem" className={item} onClick={run(() => setUi({ drawerAgentId: agent.agentId }))}>Open details</button>
        <button type="button" role="menuitem" className={item} onClick={run(onPrimary)}>{placed ? "Show on canvas" : "Place on canvas"}</button>
        <button type="button" role="menuitem" className={item} onClick={run(onEditLabel)}>{labels[agentId] ? "Edit label…" : "Add label…"}</button>
        {placed && (
          <button
            type="button"
            role="menuitem"
            className={item}
            disabled={linked}
            title={linked ? "Revoke its edges first" : undefined}
            onClick={run(onTakeOff)}
          >
            Take off canvas{linked && <span className="ml-auto pl-2 text-[13px]">has edges</span>}
          </button>
        )}
        <div className="my-0 h-px bg-line" role="separator" />
        <button type="button" role="menuitem" className={`${item} text-status-revoked`} onClick={() => setUi({ agentMenu: null, hideAgent: { agentId, at } })}>
          Hide agent…
        </button>
      </div>
    </Popover>
  );
}
