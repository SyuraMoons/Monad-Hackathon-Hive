"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { Toaster } from "@/components/app/Toaster";
import { GraphCanvas } from "@/components/canvas/GraphCanvas";
import { LiveFeed } from "@/components/canvas/LiveFeed";
import { Sidebar } from "@/components/canvas/Sidebar";
import { useLayout } from "@/lib/layout";
import { useGraph } from "@/lib/stores/graph";
import { useSession } from "@/lib/stores/session";

// Figma 07 · Canvas: 0 Empty (56:231) and 1 Live (55:46). 240 / canvas / 340 (design.md §5).
// Real by construction: everything shown comes from the graph and feed stores, which only HiveClient fills.
function Canvas({ owner }: { owner: string }) {
  const { layout, place } = useLayout(owner);
  const error = useGraph((s) => (s.status === "error" ? s.error : undefined));

  return (
    <ReactFlowProvider>
      <div className="grid h-[calc(100svh-56px)] min-h-0 grid-cols-[240px_minmax(0,1fr)_340px]">
        <Sidebar layout={layout} place={place} />
        <main className="relative min-h-0 bg-paper">
          <GraphCanvas layout={layout} place={place} />
          <Toaster />
          {error && (
            <p role="alert" className="absolute top-5 left-1/2 -translate-x-1/2 rounded-card bg-ink px-4 py-3 text-[15px] text-paper shadow-toast">
              Couldn’t load your graph: {error}
            </p>
          )}
        </main>
        <LiveFeed />
      </div>
    </ReactFlowProvider>
  );
}

export default function CanvasPage() {
  const owner = useSession((s) => s.owner);
  return owner ? <Canvas owner={owner} /> : null;
}
