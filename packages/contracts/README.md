# Hive contracts

Foundry project for the Hive permission layer: `AgentRegistry`, `KnowledgeGraph`, `MemorySlots`, and `PropagationEngine`, deployed on Monad testnet (chain 10143).

## Deployed addresses (Monad testnet)

| Contract | Address |
| --- | --- |
| AgentRegistry | `0x949Deac6ec66387778CEDe6643b875127FBb340F` |
| KnowledgeGraph | `0x3d1cB1E65F90Fde55497d1eE9159c19e5C79Bde1` |
| MemorySlots | `0x45179F9abAC535924d49C2C8Fe2B72cDb69AeDcd` |
| PropagationEngine | `0x4B6890C4424B1f1d972b4B8Ec2167f5CD6A11479` |

Source of truth: `deployments/monad-testnet.json`. Apps consume these through `@hive/shared` (`hiveDeployment`), regenerated with `pnpm --filter @hive/contracts abi`.

## Prerequisites

- Foundry 1.8.x (`brew install foundry`), which sets the Monad execution environment from `foundry.toml`.
- Submodules (`forge-std`, `openzeppelin-contracts`): `git submodule update --init` from the repo root.
- A funded deployer key. Claim testnet MON at `https://faucet.monad.xyz`.

## Build, test, coverage

```bash
forge build
forge test
pnpm --filter @hive/contracts coverage
```

42 tests, 100% line coverage on the four contracts.

## Redeploy loop

Run from `packages/contracts`.

```bash
# forge reads the key from the process env, not the repo root .env (docs/gotchas.md)
export DEPLOYER_PRIVATE_KEY=0x…        # PowerShell: $env:DEPLOYER_PRIVATE_KEY = "0x…"

# 1. Deploy (fail-fast: aborts if the deployer has 0 MON). Writes deployments/monad-testnet.json
pnpm --filter @hive/contracts deploy:testnet

# 2. Regenerate ABIs + addresses for @hive/shared, then commit both generated files
pnpm --filter @hive/contracts abi

# 3. Confirm bytecode landed before trusting the JSON: a failed broadcast still writes it
cast code <agentRegistry address from the JSON> --rpc-url monad_testnet
```

After a redeploy, update the address table above and rebuild the apps that import `@hive/shared`.

## Verify

**Not yet verified:** Sourcify has no match for the current addresses. Run this once per contract (no API key needed):

```bash
forge verify-contract <addr> <Name> --chain 10143 --verifier sourcify \
  --verifier-url https://sourcify-api-monad.blockvision.org/
```

## Layout

- `src/` — contracts + interfaces (`IAgentRegistry`, `IKnowledgeGraph`, `IMemorySlots`, `IPropagationEngine`)
- `script/Deploy.s.sol` — deploy script with a 0-MON preflight guard
- `scripts/export-abi.mjs` — emits `@hive/shared` ABIs + `addresses.generated.ts`
- `deployments/monad-testnet.json` — committed addresses (source of truth)
- `test/` — Foundry tests
