"use client";

import { useFeed } from "@/lib/stores/feed";
import { useGraph } from "@/lib/stores/graph";
import { useUi } from "@/lib/stores/ui";

// Empty shell of Figma Canvas 55:46 (sidebar 240 · canvas · feed 340). Step 6 fills each region.
export default function CanvasPage() {
  const status = useGraph((s) => s.status);
  const error = useGraph((s) => s.error);
  const agentCount = useGraph((s) => Object.keys(s.agents).length);
  const edgeCount = useGraph((s) => Object.keys(s.edges).length);
  const rowCount = useFeed((s) => s.rows.length);
  const bridge = useUi((s) => s.bridge);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)_340px]">
      <aside aria-label="Agents" className="border-r border-line bg-paper-2 px-5 pt-6">
        <h2 className="font-mono text-[14px] tracking-[0.1em] text-ink-3">AGENTS</h2>
      </aside>
      <main aria-label="Permission graph" className="grid place-items-center bg-paper">
        <p className="font-mono text-[14px] text-ink-3" aria-live="polite" data-testid="graph-status">
          {status === "error" ? `Couldn't load the graph: ${error}` : status === "ready" ? `${agentCount} agents · ${edgeCount} edges` : "Loading graph…"}
        </p>
      </main>
      <aside aria-label="Live memory" className="border-l border-line bg-paper-2 px-5 pt-5">
        <h2 className="font-display text-[22px] text-ink">Live memory</h2>
        <p className="mt-2 font-mono text-[14px] text-ink-3" data-testid="feed-status">
          bridge {bridge} · {rowCount} rows
        </p>
      </aside>
    </div>
  );
}
