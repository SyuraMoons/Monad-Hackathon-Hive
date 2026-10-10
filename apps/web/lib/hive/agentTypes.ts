import type { AgentType } from "@hive/shared";

// Display name and icon per agent type. DeepSeek has no icon yet, so it gets the dashed placeholder (ADR-020).
const META: Partial<Record<string, { label: string; icon?: string }>> = {
  claude: { label: "Claude", icon: "/agents/claude.png" },
  gpt: { label: "GPT", icon: "/agents/gpt.png" },
  deepseek: { label: "DeepSeek" },
};

/** The agent types a user can create, in display order. */
export const CREATABLE_TYPES = ["claude", "gpt", "deepseek"] as const satisfies readonly AgentType[];

export const agentTypeLabel = (type: string): string => META[type]?.label ?? "Agent";
export const agentTypeIcon = (type: string): string | undefined => META[type]?.icon;
