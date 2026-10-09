"use client";

import type { AgentId } from "@hive/shared";
import { useGraph } from "@/lib/stores/graph";
import { useSession } from "@/lib/stores/session";
import { useUi } from "@/lib/stores/ui";

/**
 * The registry can't delete an agent, so removing one hides it on this browser and ends its bridge session (ADR-012).
 * Shared by the node drawer and the sidebar menu. Refused while the agent has an edge.
 */
export async function removeAgent(agentId: AgentId): Promise<{ ok: true } | { error: string }> {
  const result = useGraph.getState().hide(agentId);
  if ("error" in result) return result;
  const { drawerAgentId, set } = useUi.getState();
  if (drawerAgentId === agentId) set({ drawerAgentId: null });
  await useSession.getState().disconnectAgent(agentId).catch(() => {}); // best effort: the keys also leave the bridge when it restarts
  return { ok: true };
}
