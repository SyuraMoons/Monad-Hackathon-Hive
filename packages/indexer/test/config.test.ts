import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AgentRegistryAbi, ERC8004_HIVE_AGENT_KEY, Erc8004IdentityRegistryAbi, KnowledgeGraphAbi, MemorySlotsAbi, PropagationEngineAbi, encodeHiveAgentRef, erc8004Deployment, hiveDeployment } from "../../shared/dist/index.js";
import { HIVE_AGENT_KEY, HIVE_AGENT_REGISTRY, parseHiveAgentRef } from "../src/lib.js";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = readFileSync(join(root, "config.yaml"), "utf8");

describe("config.yaml stays in step with @hive/shared (rule 4)", () => {
  it.each([
    ["AgentRegistry", AgentRegistryAbi, hiveDeployment.agentRegistry],
    ["KnowledgeGraph", KnowledgeGraphAbi, hiveDeployment.knowledgeGraph],
    ["MemorySlots", MemorySlotsAbi, hiveDeployment.memorySlots],
    ["PropagationEngine", PropagationEngineAbi, hiveDeployment.propagationEngine],
    ["Erc8004IdentityRegistry", Erc8004IdentityRegistryAbi, erc8004Deployment.identityRegistry],
  ])("%s: abis/ file and address", (name, abi, address) => {
    expect(JSON.parse(readFileSync(join(root, "abis", `${name}.json`), "utf8")), `run: pnpm --filter @hive/indexer sync`).toEqual(JSON.parse(JSON.stringify(abi)));
    const listed = new RegExp(`- name: ${name}\\s+address: "?(0x[0-9a-fA-F]{40})"?`).exec(config)?.[1];
    expect(listed?.toLowerCase()).toBe(address.toLowerCase());
  });
  it("reads the ERC-8004 link the way @hive/shared writes it", () => {
    expect(HIVE_AGENT_KEY).toBe(ERC8004_HIVE_AGENT_KEY);
    expect(HIVE_AGENT_REGISTRY).toBe(hiveDeployment.agentRegistry.toLowerCase());
    expect(parseHiveAgentRef(encodeHiveAgentRef(hiveDeployment.agentRegistry, 7n))).toEqual({ agentRegistry: HIVE_AGENT_REGISTRY, agentId: "7" });
  });
  it("indexes the testnet chain", () => {
    expect(config).toContain(`- id: ${hiveDeployment.chainId}`);
  });
});
