// Writes abis/*.json from @hive/shared and checks that config.yaml lists the same addresses as hiveDeployment.
// @hive/shared is read by path and is not a dependency: Envio Cloud builds this folder on its own, so nothing the
// indexer runs may import from outside it. Run `pnpm --filter @hive/shared build` first. `--check` only compares and exits 1 on drift.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AgentRegistryAbi, Erc8004IdentityRegistryAbi, KnowledgeGraphAbi, MemorySlotsAbi, PropagationEngineAbi, erc8004Deployment, hiveDeployment } from "../../shared/dist/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");

const abis = { AgentRegistry: AgentRegistryAbi, KnowledgeGraph: KnowledgeGraphAbi, MemorySlots: MemorySlotsAbi, PropagationEngine: PropagationEngineAbi, Erc8004IdentityRegistry: Erc8004IdentityRegistryAbi };
const addresses = {
  AgentRegistry: hiveDeployment.agentRegistry,
  KnowledgeGraph: hiveDeployment.knowledgeGraph,
  MemorySlots: hiveDeployment.memorySlots,
  PropagationEngine: hiveDeployment.propagationEngine,
  Erc8004IdentityRegistry: erc8004Deployment.identityRegistry,
};

let drift = false;
mkdirSync(join(root, "abis"), { recursive: true });
for (const [name, abi] of Object.entries(abis)) {
  const file = join(root, "abis", `${name}.json`);
  const next = `${JSON.stringify(abi, null, 2)}\n`;
  if (check) {
    let current = "";
    try { current = readFileSync(file, "utf8"); } catch { /* missing */ }
    if (current !== next) { console.error(`abis/${name}.json is out of date with @hive/shared`); drift = true; }
  } else writeFileSync(file, next);
}

const config = readFileSync(join(root, "config.yaml"), "utf8");
for (const [name, address] of Object.entries(addresses)) {
  const listed = new RegExp(`- name: ${name}\\s+address: "?(0x[0-9a-fA-F]{40})"?`).exec(config)?.[1];
  if (listed?.toLowerCase() !== address.toLowerCase()) { console.error(`config.yaml: ${name} is ${listed ?? "missing"}, expected ${address}`); drift = true; }
}
if (drift) process.exit(1);
console.log(check ? "indexer config matches @hive/shared" : "abis written, addresses match @hive/shared");
