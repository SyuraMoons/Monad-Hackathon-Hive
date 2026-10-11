import { indexer } from "envio";
import { auditRow } from "../audit.js";
import { auditId } from "../lib.js";
import { bumpAgent, bumpOwner, bumpTopic } from "../stats.js";

indexer.onEvent({ contract: "KnowledgeGraph", event: "EdgeAdded" }, async ({ event, context }) => {
  const id = event.params.edgeId.toString();
  const fromAgent = event.params.from.toString();
  const toAgent = event.params.to.toString();
  const { topic } = event.params;
  const expiresAt = Number(event.params.expiresAt);
  const at = event.block.timestamp;
  const txHash = event.transaction.hash;
  const sender = await context.Agent.get(fromAgent);
  if (!sender) {
    context.log.warn("EdgeAdded from an agent that was never registered", { edgeId: id });
    return;
  }
  const owner = sender.owner;
  context.Edge.set({ id, owner, fromAgent, toAgent, topic, expiresAt, active: true, addedTx: txHash, removedTx: undefined, addedAt: at, removedAt: undefined, propagationCount: 0, lifetimeSeconds: undefined });
  context.AuditEvent.set(auditRow({
    id: auditId.edgeAdded(id), owner, kind: "edge.added", at, block: event.block.number, logIndex: event.logIndex, txHash,
    edgeId: id, fromAgent, toAgent, topic, expiresAt,
  }));
  await bumpAgent(context, fromAgent, { edgesOut: 1 });
  await bumpAgent(context, toAgent, { edgesIn: 1 });
  await bumpTopic(context, owner, topic, { edges: 1 });
  await bumpOwner(context, owner, { edgesAdded: 1 });
});

indexer.onEvent({ contract: "KnowledgeGraph", event: "EdgeRemoved" }, async ({ event, context }) => {
  const id = event.params.edgeId.toString();
  const edge = await context.Edge.get(id);
  if (!edge || !edge.active) {
    context.log.warn("EdgeRemoved for an edge that is unknown or already revoked", { edgeId: id });
    return;
  }
  const at = event.block.timestamp;
  const txHash = event.transaction.hash;
  context.Edge.set({ ...edge, active: false, removedTx: txHash, removedAt: at, lifetimeSeconds: Math.max(0, at - edge.addedAt) });
  context.AuditEvent.set(auditRow({
    id: auditId.edgeRemoved(id), owner: edge.owner, kind: "edge.removed", at, block: event.block.number, logIndex: event.logIndex, txHash,
    edgeId: id, fromAgent: edge.fromAgent, toAgent: edge.toAgent, topic: edge.topic,
  }));
  await bumpAgent(context, edge.fromAgent, { edgesOut: -1 });
  await bumpAgent(context, edge.toAgent, { edgesIn: -1 });
  await bumpOwner(context, edge.owner, { edgesRevoked: 1 });
});
