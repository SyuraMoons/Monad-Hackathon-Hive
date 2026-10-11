import { indexer } from "envio";
import { auditRow } from "../audit.js";
import { auditId } from "../lib.js";
import { bumpOwner } from "../stats.js";

indexer.onEvent({ contract: "AgentRegistry", event: "AgentRegistered" }, async ({ event, context }) => {
  const id = event.params.agentId.toString();
  const owner = event.params.owner;
  const at = event.block.timestamp;
  const txHash = event.transaction.hash;
  context.Agent.set({ id, owner, name: event.params.name, agentType: event.params.agentType, writer: undefined, registeredAt: at, registeredTx: txHash, erc8004Id: undefined });
  context.AgentStats.set({ id, owner, writes: 0, received: 0, edgesOut: 0, edgesIn: 0, lastActiveAt: at });
  context.AuditEvent.set(auditRow({
    id: auditId.agent(id), owner, kind: "agent.registered", at, block: event.block.number, logIndex: event.logIndex, txHash,
    agentId: id, name: event.params.name, agentType: event.params.agentType,
  }));
  await bumpOwner(context, owner, { agents: 1 });
});

indexer.onEvent({ contract: "AgentRegistry", event: "AgentWriterSet" }, async ({ event, context }) => {
  const agent = await context.Agent.get(event.params.agentId.toString());
  if (!agent) {
    context.log.warn("AgentWriterSet for an agent that was never registered", { agentId: event.params.agentId.toString() });
    return;
  }
  context.Agent.set({ ...agent, writer: event.params.writer });
});
