import { z } from "zod";
import { zAddress, zAgentId, zContentHash, zSlotId, zTopic, zTxHash, zUnixSeconds } from "../ids.js";

// MCP tools (rules §4). The caller's identity comes from its token, never from an argument (golden rule 3).

export const MAX_CONTENT_BYTES = 4096;
const byteLength = (s: string) => new TextEncoder().encode(s).length;

export const zWriteMemoryInput = z.object({
  topic: zTopic,
  content: z.string().min(1).refine((s) => byteLength(s) <= MAX_CONTENT_BYTES, `content must be at most ${MAX_CONTENT_BYTES} bytes`),
});
export const zWriteMemoryOutput = z.object({
  slotId: zSlotId,
  contentHash: zContentHash,
  txHash: zTxHash,
  propagatedTo: z.array(zAgentId),
});

export const zReadMemoryInput = z.object({ since: zUnixSeconds.optional(), topic: zTopic.optional() });
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
  hive_read_memory: { input: zReadMemoryInput, output: zReadMemoryOutput },
  hive_whoami: { input: zWhoamiInput, output: zWhoamiOutput },
} as const;
export type McpToolName = keyof typeof MCP_TOOLS;

export type WriteMemoryInput = z.input<typeof zWriteMemoryInput>;
export type WriteMemoryOutput = z.infer<typeof zWriteMemoryOutput>;
export type ReadMemoryInput = z.input<typeof zReadMemoryInput>;
export type ReadMemoryOutput = z.infer<typeof zReadMemoryOutput>;
export type WhoamiOutput = z.infer<typeof zWhoamiOutput>;
