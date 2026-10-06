"use client";

import { Handle, Position, useConnection, type Node, type NodeProps } from "@xyflow/react";
import Image from "next/image";
import { memo } from "react";
import { StatusDot } from "@/components/ui/StatusDot";
import { cn } from "@/lib/cn";
import { agentLabel } from "@/lib/format";
import { useGraph } from "@/lib/stores/graph";

export type AgentNodeData = { agentId: string; isolated: boolean; revoked?: boolean };
export type AgentFlowNode = Node<AgentNodeData, "agent">;

const ICONS: Partial<Record<string, string>> = { claude: "/agents/claude.png", gpt: "/agents/gpt.png" };

// Figma Canvas Node 55:118: Active · Isolated · Revoked · Selected. Data is read from the store by id.
function AgentNodeImpl({ id, data, selected }: NodeProps<AgentFlowNode>) {
  const connection = useConnection();
  const connecting = connection.inProgress;
  const agent = useGraph((s) => s.agents[data.agentId]);
  if (!agent) return null;
  const { isolated, revoked } = data;
  const icon = ICONS[agent.agentType];
  const status = revoked ? "revoked" : agent.connected ? "active" : "idle";
  const authorized = !agent.connected && agent.tokenExpiresAt !== null && agent.tokenExpiresAt > Math.floor(Date.now() / 1000);
  const statusText = revoked ? "revoked" : agent.connected ? "connected" : authorized ? "waiting for its first call" : "not connected";

  return (
    <div className="relative" data-agent-node={data.agentId}>
      <div
        className={cn(
          "hive-node relative flex w-[220px] items-center gap-3 rounded-card border py-3.5 pr-5 pl-[18px] transition-[box-shadow,border-color] duration-150",
          isolated ? "border-dashed border-clay bg-paper-2" : "border-ink bg-paper shadow-node",
          selected && "outline-2 outline-offset-[5px] outline-amber-strong [outline-style:solid] rounded-card",
        )}
      >
        {!isolated && <span aria-hidden="true" className="absolute top-[11px] bottom-[11px] -left-px w-[3px] bg-amber-strong" />}
        <span className="relative size-6 shrink-0 overflow-hidden rounded-sm" aria-hidden="true">
          {icon && !isolated ? (
            <Image src={icon} alt="" width={24} height={24} />
          ) : (
            <span className="block size-full rounded-full border border-dashed border-clay" />
          )}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className={cn("truncate font-display text-[19px] leading-tight", isolated ? "text-ink-3" : "text-ink")}>{agent.name}</span>
          <span className="font-mono text-[14px] text-ink-3">{agentLabel(agent.agentId, agent.agentKey)}</span>
        </span>
        <StatusDot status={status} label={`${agent.name}: ${statusText}`} className="absolute top-[11px] right-[13px]" />
        {/* Drag from the right handle to another agent to draw an edge. While a connection is being dragged,
            the whole node becomes the drop target, so it connects wherever you release on it. */}
        <Handle id="in" type="target" position={Position.Left} className="hive-handle" />
        {connecting && connection.fromNode?.id !== id && (
          <Handle id="drop" type="target" position={Position.Left} isConnectableStart={false} className="hive-drop-target" />
        )}
        <Handle id="out" type="source" position={Position.Right} className="hive-handle" />
      </div>
      {isolated && <p className="absolute top-full left-0 mt-2.5 font-mono text-[14px] whitespace-nowrap text-ink-3">no edges · isolated</p>}
    </div>
  );
}

export const AgentNode = memo(AgentNodeImpl);
