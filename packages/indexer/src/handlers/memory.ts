import { indexer } from "envio";
import { auditRow } from "../audit.js";
import { auditId } from "../lib.js";
import { bumpAgent, bumpOwner, bumpTopic } from "../stats.js";

indexer.onEvent({ contract: "MemorySlots", event: "MemoryWritten" }, async ({ event, context }) => {
  const id = event.params.slotId.toString();
  const agentId = event.params.agentId.toString();
  const { topic } = event.params;
  const at = Number(event.params.writtenAt);
  const txHash = event.transaction.hash;
  const contentHash = event.params.contentHash;
  const agent = await context.Agent.get(agentId);
  if (!agent) {
    context.log.warn("MemoryWritten by an agent that was never registered", { slotId: id });
    return;
  }
  const owner = agent.owner;
  context.MemorySlot.set({ id, owner, agentId, contentHash, topic, txHash, writtenAt: at, propagatedCount: 0 });
  // propagatedCount is filled in by the Propagate logs of the same tx (see propagation.ts).
  context.AuditEvent.set(auditRow({
    id: auditId.written(id), owner, kind: "memory.written", at, block: event.block.number, logIndex: event.logIndex, txHash,
    agentId, slotId: id, contentHash, topic, propagatedCount: 0,
  }));
  await bumpAgent(context, agentId, { writes: 1 }, at);
  await bumpTopic(context, owner, topic, { writes: 1 });
  await bumpOwner(context, owner, { memories: 1 });
});
