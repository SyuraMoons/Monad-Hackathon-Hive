export type AgentConnection = "connected" | "waiting" | "none";

/**
 * `connected` on the wire means "has made a tool call" (docs/backend-handoff.md). An agent that was authorized but has not
 * called yet has a live session and a token, so it is "waiting", not "none". Only `none` needs a reconnect.
 */
export function agentConnection(agent: { connected: boolean; tokenExpiresAt: number | null }, nowS: number): AgentConnection {
  if (agent.connected) return "connected";
  return agent.tokenExpiresAt !== null && agent.tokenExpiresAt > nowS ? "waiting" : "none";
}

export const CONNECTION_TEXT: Record<AgentConnection, string> = {
  connected: "connected",
  waiting: "waiting for its first call",
  none: "not connected",
};
