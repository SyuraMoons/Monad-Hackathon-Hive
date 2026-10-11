import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AgentRegistryAbi, KnowledgeGraphAbi, MemorySlotsAbi, PropagationEngineAbi, hiveDeployment } from "../../shared/dist/index.js";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = readFileSync(join(root, "config.yaml"), "utf8");

describe("config.yaml stays in step with @hive/shared (rule 4)", () => {
  it.each([
    ["AgentRegistry", AgentRegistryAbi, hiveDeployment.agentRegistry],
    ["KnowledgeGraph", KnowledgeGraphAbi, hiveDeployment.knowledgeGraph],
    ["MemorySlots", MemorySlotsAbi, hiveDeployment.memorySlots],
    ["PropagationEngine", PropagationEngineAbi, hiveDeployment.propagationEngine],
  ])("%s: abis/ file and address", (name, abi, address) => {
    expect(JSON.parse(readFileSync(join(root, "abis", `${name}.json`), "utf8")), `run: pnpm --filter @hive/indexer sync`).toEqual(JSON.parse(JSON.stringify(abi)));
    const listed = new RegExp(`- name: ${name}\\s+address: "?(0x[0-9a-fA-F]{40})"?`).exec(config)?.[1];
    expect(listed?.toLowerCase()).toBe(address.toLowerCase());
  });
  it("indexes the testnet chain", () => {
    expect(config).toContain(`- id: ${hiveDeployment.chainId}`);
  });
});
