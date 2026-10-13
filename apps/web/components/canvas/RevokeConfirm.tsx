"use client";

import { PillButton } from "@/components/ui/Pill";
import { Popover } from "@/components/ui/Popover";
import { revokeEdge } from "@/lib/edgeActions";
import { useGraph } from "@/lib/stores/graph";
import { useUi, type Anchor } from "@/lib/stores/ui";

// Revoke confirm. Copy is exact; it says plainly what revoking can't undo.
export function RevokeConfirm({ edgeKey, at }: { edgeKey: string; at: Anchor }) {
  const edge = useGraph((s) => s.edges[edgeKey]);
  const agents = useGraph((s) => s.agents);
  const setUi = useUi((s) => s.set);
  if (!edge || edge.state !== "signed") return null;
  const from = agents[edge.from.toString()]?.name ?? `#${edge.from}`;
  const to = agents[edge.to.toString()]?.name ?? `#${edge.to}`;

  return (
    <Popover
      role="alertdialog"
      label={`Revoke edge ${from} to ${to}`}
      onClose={() => setUi({ revokeEdge: null })}
      autoFocusSelector="[data-autofocus]"
      className="flex w-[390px] max-w-[calc(100%-32px)] flex-col gap-3.5 rounded-menu border border-status-revoked bg-paper px-[22px] py-5 shadow-[0_10px_24px_rgb(0_0_0/0.16)]"
      style={{ left: at.x, top: at.y }}
    >
      <p className="font-mono text-[14px] tracking-[0.1em] text-status-revoked">REVOKE EDGE</p>
      <h2 className="font-display text-[24px] leading-tight whitespace-pre text-ink">
        {from}  ✕  {to}  ·  {edge.topic}
      </h2>
      <p className="text-[15px] leading-[1.5] text-ink-2">
        {to} stops receiving “{edge.topic}” memory now. The bridge checks this edge on every read, so it also loses access to what already came through.
      </p>
      <p className="text-[14px] leading-[1.5] text-ink-3">
        Anything {to} already said in its own chats stays there. Hive can’t unsay it.
      </p>
      <div className="flex items-center justify-between gap-4">
        <button type="button" data-autofocus onClick={() => setUi({ revokeEdge: null })} className="min-h-9 cursor-pointer text-[15px] font-medium text-ink-2 underline underline-offset-2 hover:text-ink">
          Keep edge
        </button>
        <PillButton variant="danger" onClick={() => void revokeEdge(edgeKey)}>
          Revoke with passkey
        </PillButton>
      </div>
    </Popover>
  );
}
