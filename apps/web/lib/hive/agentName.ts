export const MAX_AGENT_NAME = 64; // zAgent.name

/** The trimmed name, or a message for the user. Names are unique among the owner's agents, ignoring case. */
export function checkAgentName(raw: string, taken: string[]): { name: string } | { error: string } {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) return { error: "Give the agent a name." };
  if (name.length > MAX_AGENT_NAME) return { error: `Use ${MAX_AGENT_NAME} characters or fewer.` };
  if (taken.some((t) => t.toLowerCase() === name.toLowerCase())) return { error: "You already have an agent with that name." };
  return { name };
}
