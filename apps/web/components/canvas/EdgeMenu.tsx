"use client";

import { useRef, type KeyboardEvent } from "react";
import { Popover } from "@/components/ui/Popover";
import { explorerTx } from "@/lib/explorer";
import { useGraph } from "@/lib/stores/graph";
import { useUi, type Anchor } from "@/lib/stores/ui";

const item = "flex min-h-9 w-full cursor-pointer items-center px-3.5 py-[9px] text-left text-[15px] text-ink hover:bg-paper-2 focus-visible:bg-paper-2 focus-visible:outline-none";

// Figma Canvas 3 Revoke (61:239): 240 wide, radius 10, ink border, shadow-menu. Arrow keys move between items.
export function EdgeMenu({ edgeKey, at }: { edgeKey: string; at: Anchor }) {
  const edge = useGraph((s) => s.edges[edgeKey]);
  const setUi = useUi((s) => s.set);
  const list = useRef<HTMLDivElement>(null);
  if (!edge || edge.state !== "signed") return null;

  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  }

  return (
    <Popover
      role="menu"
      label="Edge actions"
      onClose={() => setUi({ edgeMenu: null })}
      className="w-60 rounded-card border border-ink bg-paper py-1.5 shadow-menu"
      style={{ left: at.x, top: at.y }}
    >
      <div ref={list} onKeyDown={onKeyDown}>
        <button
          type="button"
          role="menuitem"
          className={item}
          onClick={() => setUi({ edgeMenu: null, edgeEditor: { from: edge.from, to: edge.to, topic: edge.topic } })}
        >
          Edit topic or expiry
        </button>
        {edge.addedTx && (
          <a role="menuitem" href={explorerTx(edge.addedTx)} target="_blank" rel="noreferrer" className={item} onClick={() => setUi({ edgeMenu: null })}>
            View on Monadscan →
          </a>
        )}
        <div className="my-0 h-px bg-line" role="separator" />
        <button
          type="button"
          role="menuitem"
          className={`${item} text-status-revoked`}
          onClick={() => setUi({ edgeMenu: null, revokeEdge: { key: edgeKey, at } })}
        >
          Revoke edge…
        </button>
      </div>
    </Popover>
  );
}
