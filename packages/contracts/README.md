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

## Build, test, coverage

```bash
forge build
forge test --network monad
pnpm --filter @hive/contracts coverage
```

42 tests, 100% line coverage.

## Redeploy loop

```bash
# forge reads the key from the process env (docs/gotchas.md), not the repo root .env
$env:DEPLOYER_PRIVATE_KEY = "0x…"

# 1. Deploy (fail-fast: aborts if the deployer has 0 MON)
pnpm --filter @hive/contracts deploy:testnet

# 2. Regenerate ABIs + addresses for @hive/shared
pnpm --filter @hive/contracts abi

# 3. Confirm bytecode landed before trusting the JSON — a failed broadcast still writes it
cast code 0x949Deac6ec66387778CEDe6643b875127FBb340F --rpc-url monad_testnet
```

Claim testnet MON at `https://faucet.monad.xyz` before deploying.

## Verify

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
