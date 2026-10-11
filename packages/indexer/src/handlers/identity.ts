import { indexer } from "envio";
import { HIVE_AGENT_KEY, HIVE_AGENT_REGISTRY, parseHiveAgentRef } from "../lib.js";

// The public ERC-8004 Identity Registry (ADR-028). Anyone can register there and anyone can write any metadata on
// their own identity, so nothing here is trusted until the owners match. It is display data: permissions never read it.

indexer.onEvent({ contract: "Erc8004IdentityRegistry", event: "Registered" }, async ({ event, context }) => {
  context.Erc8004Identity.set({
    id: event.params.agentId.toString(),
    owner: event.params.owner,
    agentURI: event.params.agentURI,
    registeredAt: event.block.timestamp,
    registeredTx: event.transaction.hash,
    hiveAgentId: undefined,
  });
});

indexer.onEvent({ contract: "Erc8004IdentityRegistry", event: "MetadataSet" }, async ({ event, context }) => {
  if (event.params.metadataKey !== HIVE_AGENT_KEY) return;
  const id = event.params.agentId.toString();
  const ref = parseHiveAgentRef(event.params.metadataValue);
  if (!ref || ref.agentRegistry !== HIVE_AGENT_REGISTRY) return;
  // An identity registered before the start block is not in the index, so its owner is unknown: no link.
  const identity = await context.Erc8004Identity.get(id);
  const agent = await context.Agent.get(ref.agentId);
  if (!identity || !agent || identity.owner.toLowerCase() !== agent.owner.toLowerCase()) {
    context.log.warn("hiveAgentId metadata that the owner check does not confirm", { erc8004Id: id, hiveAgentId: ref.agentId });
    return;
  }
  context.Erc8004Identity.set({ ...identity, hiveAgentId: ref.agentId });
  // The first identity stays: a second one for the same agent is kept as its own row, not as the agent's.
  if (agent.erc8004Id === undefined) context.Agent.set({ ...agent, erc8004Id: id });
});
