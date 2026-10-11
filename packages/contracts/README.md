# Hive contracts

Foundry project for the Hive permission layer: `AgentRegistry`, `KnowledgeGraph`, `MemorySlots`, and `PropagationEngine`, deployed on Monad testnet (chain 10143).

## Deployed addresses (Monad testnet)

| Contract | Address |
| --- | --- |
| AgentRegistry | `0x06F4401cF289bfc29de59Fc1B624096Dc69ff25B` |
| KnowledgeGraph | `0x80db4a46BEE029464Aa1fca083985d1C5178AFd6` |
| MemorySlots | `0xdE8DAf9599366b2ef8Ae245bF574808844Aa5f8a` |
| PropagationEngine | `0x4af2CC25026f918E88d727704D3FB888C20b0397` |

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

55 tests, 100% line coverage on the four contracts (measured 11 Oct).

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
