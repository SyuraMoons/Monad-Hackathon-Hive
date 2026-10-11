import { indexer } from "envio";
import { auditRow } from "../audit.js";
import { auditId, pickEdge } from "../lib.js";
import { bumpAgent, bumpOwner, bumpTopic } from "../stats.js";

// MemorySlots.write emits MemoryWritten and then calls the engine, so Propagate logs follow their
// MemoryWritten in the same tx. The log has no slot id: it is joined by tx hash, sender and content hash.
indexer.onEvent({ contract: "PropagationEngine", event: "Propagate" }, async ({ event, context }) => {
  const fromAgent = event.params.from.toString();
  const toAgent = event.params.to.toString();
  const { topic } = event.params;
  const contentHash = event.params.contentHash;
  const at = Number(event.params.timestamp);
  const txHash = event.transaction.hash;
  const sender = await context.Agent.get(fromAgent);
  if (!sender) {
    context.log.warn("Propagate from an agent that was never registered", { txHash });
    return;
  }
  const owner = sender.owner;

  const slot = (await context.MemorySlot.getWhere({ txHash: { _eq: txHash } })).find((s) => s.agentId === fromAgent && s.contentHash === contentHash);
  const sameTx = await context.Propagation.getWhere({ txHash: { _eq: txHash } });
  const used = new Set(sameTx.filter((p) => p.fromAgent === fromAgent && p.toAgent === toAgent && p.contentHash === contentHash).map((p) => p.edgeId ?? ""));
  const edge = pickEdge(await context.Edge.getWhere({ fromAgent: { _eq: fromAgent } }), { toAgent, topic, at }, used);

  context.Propagation.set({ id: `${txHash}:${event.logIndex}`, owner, slotId: slot?.id, fromAgent, toAgent, contentHash, topic, edgeId: edge?.id, txHash, at });
  context.AuditEvent.set(auditRow({
    id: auditId.propagated(txHash, event.logIndex), owner, kind: "memory.propagated", at, block: event.block.number, logIndex: event.logIndex, txHash,
    slotId: slot?.id, fromAgent, toAgent, contentHash, topic,
  }));

  if (slot) {
    context.MemorySlot.set({ ...slot, propagatedCount: slot.propagatedCount + 1 });
    const written = await context.AuditEvent.get(auditId.written(slot.id));
    if (written) context.AuditEvent.set({ ...written, propagatedCount: slot.propagatedCount + 1 });
  }
  if (edge) context.Edge.set({ ...edge, propagationCount: edge.propagationCount + 1 });
  await bumpAgent(context, toAgent, { received: 1 });
  await bumpTopic(context, owner, topic, { propagations: 1 });
  await bumpOwner(context, owner, { propagations: 1 });

  // The invariant the product promises: nothing is delivered without an active edge (or without its slot).
  const reason = !edge ? "no_active_edge" : !slot ? "no_slot" : undefined;
  if (reason) {
    context.PolicyViolation.set({ id: `${txHash}:${event.logIndex}`, owner, reason, fromAgent, toAgent, topic, contentHash, txHash, at });
    await bumpOwner(context, owner, { violations: 1 });
  }
});
