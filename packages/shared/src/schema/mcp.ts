import { z } from "zod";
import { zAddress, zAgentId, zContentHash, zSlotId, zTopic, zTxHash, zUnixSeconds } from "../ids.js";

// MCP tools (rules §4). The caller's identity comes from its token, never from an argument (golden rule 3).

export const MAX_CONTENT_BYTES = 4096;
const byteLength = (s: string) => new TextEncoder().encode(s).length;

const zContent = z.string().min(1).refine((s) => byteLength(s) <= MAX_CONTENT_BYTES, `content must be at most ${MAX_CONTENT_BYTES} bytes`);

/** Where `hive_save_session` writes when no topic is given (ADR-014). */
export const DEFAULT_TOPIC = "general";

export const zWriteMemoryInput = z.object({
  topic: zTopic,
  content: zContent,
});
export const zWriteMemoryOutput = z.object({
  slotId: zSlotId,
  contentHash: zContentHash,
  txHash: zTxHash,
  propagatedTo: z.array(zAgentId),
});


export const zSaveSessionInput = z.object({ summary: zContent, topic: zTopic.optional() });
export const zSaveSessionOutput = zWriteMemoryOutput.extend({ topic: zTopic });

export const MEMORY_PAGE_DEFAULT = 20;
export const MEMORY_PAGE_MAX = 50;
export const PREVIEW_CHARS = 160;

const zLimit = z.number().int().min(1).max(MEMORY_PAGE_MAX).optional().describe(`How many of the newest memories to return (default ${MEMORY_PAGE_DEFAULT}, at most ${MEMORY_PAGE_MAX}).`);
const zTopicFilter = zTopic.optional().describe("Optional filter. Leave it out to read every topic shared with you.");

export const zReadMemoryInput = z.object({
  since: zUnixSeconds.optional(),
  topic: zTopicFilter,
  slotIds: z.array(zSlotId).min(1).max(MEMORY_PAGE_MAX).optional().describe("Only these slots, for example ids from hive_list_memory."),
  limit: zLimit,
});
export const zReadMemoryOutput = z.object({
  memories: z.array(
    z.object({
      slotId: zSlotId,
      fromAgentId: zAgentId,
      fromName: z.string(),
      topic: zTopic,
      content: z.string(),
      writtenAt: zUnixSeconds,
    }),
  ),
  /** True when older readable memories were left out by `limit`. */
  more: z.boolean().default(false),
});

export const zListMemoryInput = z.object({ since: zUnixSeconds.optional(), topic: zTopicFilter, limit: zLimit });
export const zListMemoryOutput = z.object({
  memories: z.array(
    z.object({
      slotId: zSlotId,
      fromAgentId: zAgentId,
      fromName: z.string(),
      topic: zTopic,
      writtenAt: zUnixSeconds,
      bytes: z.number().int().nonnegative(),
      preview: z.string(),
    }),
  ),
  more: z.boolean().default(false),
});

export const zWhoamiInput = z.object({}).strict();
export const zWhoamiOutput = z.object({
  agentId: zAgentId,
  name: z.string(),
  owner: zAddress,
  tokenExpiresAt: zUnixSeconds,
  readableTopics: z.array(z.object({ fromAgentId: zAgentId, topic: zTopic, expiresAt: zUnixSeconds })),
});

export const MCP_TOOLS = {
  hive_write_memory: { input: zWriteMemoryInput, output: zWriteMemoryOutput },
  hive_save_session: { input: zSaveSessionInput, output: zSaveSessionOutput },
  hive_list_memory: { input: zListMemoryInput, output: zListMemoryOutput },
  hive_read_memory: { input: zReadMemoryInput, output: zReadMemoryOutput },
  hive_whoami: { input: zWhoamiInput, output: zWhoamiOutput },
} as const;
export type McpToolName = keyof typeof MCP_TOOLS;

export type WriteMemoryInput = z.input<typeof zWriteMemoryInput>;
export type WriteMemoryOutput = z.infer<typeof zWriteMemoryOutput>;
export type SaveSessionInput = z.input<typeof zSaveSessionInput>;
export type SaveSessionOutput = z.infer<typeof zSaveSessionOutput>;
export type ReadMemoryInput = z.input<typeof zReadMemoryInput>;
export type ReadMemoryOutput = z.infer<typeof zReadMemoryOutput>;
export type ListMemoryInput = z.input<typeof zListMemoryInput>;
export type ListMemoryOutput = z.infer<typeof zListMemoryOutput>;
export type WhoamiOutput = z.infer<typeof zWhoamiOutput>;
