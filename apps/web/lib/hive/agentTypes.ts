import type { AgentType } from "@hive/shared";

// Display name and icon per agent type.
const META: Partial<Record<string, { label: string; icon?: string }>> = {
  claude: { label: "Claude", icon: "/agents/claude.png" },
  gpt: { label: "GPT", icon: "/agents/gpt.png" },
  deepseek: { label: "DeepSeek", icon: "/agents/deepseek.png" },
};

/** The agent types a user can create, in display order. */
export const CREATABLE_TYPES = ["claude", "gpt", "deepseek"] as const satisfies readonly AgentType[];

export const agentTypeLabel = (type: string): string => META[type]?.label ?? "Agent";
export const agentTypeIcon = (type: string): string | undefined => META[type]?.icon;

/** The types that have a connect guide (the creatable ones). */
export type GuideType = (typeof CREATABLE_TYPES)[number];
export const hasGuide = (type: string): type is GuideType => (CREATABLE_TYPES as readonly string[]).includes(type);

/** What the user connects the agent to: "Connect to ChatGPT…", where the type's own label is the shorter "GPT". */
export const PRODUCT: Record<GuideType, string> = { claude: "Claude", gpt: "ChatGPT", deepseek: "DeepSeek" };
