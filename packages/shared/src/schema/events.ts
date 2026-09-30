import { z } from "zod";
import { zAgentId, zContentHash, zSlotId, zTopic, zTxHash, zUnixSeconds } from "../ids.js";

// SSE on /v1/events (rules §5.2). Payloads never carry plaintext (golden rule 4).

const event = <T extends string, D extends z.ZodType>(type: T, data: D) =>
  z.object({ id: z.string().min(1), type: z.literal(type), at: zUnixSeconds, data });

export const zHiveEvent = z.discriminatedUnion("type", [
  event("agent.connected", z.object({ agentId: zAgentId })),
  event("agent.disconnected", z.object({ agentId: zAgentId })),
  event(
    "memory.written",
    z.object({
      slotId: zSlotId,
      agentId: zAgentId,
      topic: zTopic,
      contentHash: zContentHash,
      txHash: zTxHash,
      propagatedTo: z.array(zAgentId),
    }),
  ),
  event(
    "memory.read",
    z.object({ readerAgentId: zAgentId, fromAgentIds: z.array(zAgentId), count: z.number().int().nonnegative() }),
  ),
  event("session.expiring", z.object({ agentId: zAgentId, expiresAt: zUnixSeconds })),
]);

export type HiveEvent = z.infer<typeof zHiveEvent>;
export type HiveEventWire = z.input<typeof zHiveEvent>;
export type HiveEventType = HiveEvent["type"];
