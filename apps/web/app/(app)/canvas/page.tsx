"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { Toaster } from "@/components/app/Toaster";
import { ConnectAgentModal } from "@/components/canvas/ConnectAgentModal";
import { GraphCanvas } from "@/components/canvas/GraphCanvas";
import { LiveFeed } from "@/components/canvas/LiveFeed";
import { NodeDrawer } from "@/components/canvas/NodeDrawer";
import { Sidebar } from "@/components/canvas/Sidebar";
import { useLayout } from "@/lib/layout";
import { useGraph } from "@/lib/stores/graph";
import { useSession } from "@/lib/stores/session";
import { useUi } from "@/lib/stores/ui";

// Canvas layout: 240 / canvas / 340.
// Real by construction: everything shown comes from the graph and feed stores, which only HiveClient fills.
function Canvas({ owner }: { owner: string }) {
  const { layout, place, unplace } = useLayout(owner);
  const error = useGraph((s) => (s.status === "error" ? s.error : undefined));
  const drawer = useUi((s) => s.drawerAgentId);
  const connect = useUi((s) => s.connectAgent);

  return (
    <ReactFlowProvider>
      <div className="grid h-[calc(100svh-56px)] min-h-0 grid-cols-[240px_minmax(0,1fr)_340px]">
        <Sidebar layout={layout} place={place} unplace={unplace} />
        <main className="relative min-h-0 bg-paper">
          <GraphCanvas layout={layout} place={place} />
          <Toaster />
          {error && (
            <p role="alert" className="absolute top-5 left-1/2 -translate-x-1/2 rounded-card bg-ink px-4 py-3 text-[15px] text-paper shadow-toast">
              Couldn’t load your graph: {error}
            </p>
          )}
        </main>
        {/* The node drawer covers the feed panel. */}
        <div className="relative grid min-h-0">
          <LiveFeed />
          {drawer !== null && <NodeDrawer key={drawer.toString()} agentId={drawer.toString()} />}
        </div>
      </div>
      {connect !== null && <ConnectAgentModal key={connect.toString()} agentId={connect.toString()} />}
    </ReactFlowProvider>
  );
}

export default function CanvasPage() {
  const owner = useSession((s) => s.owner);
  return owner ? <Canvas owner={owner} /> : null;
}
