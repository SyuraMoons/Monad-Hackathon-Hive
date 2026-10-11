# @hive/indexer

Envio HyperIndex for Hive's audit trail on Monad testnet (chain 10143). It turns the four contracts' events into a queryable history: who registered which agent, which edge allowed whom to read which topic, which memory was written and where it went, plus derived stats and a check that nothing was delivered without an active edge.

It is for history and display only. Permission checks never read it: the bridge reads live chain state (AGENTS.md rule 3). Everything it stores is already public onchain (agent names, topic text, content hashes), never memory plaintext.

Status: handlers and tests work with simulated events. Not yet synced against testnet or deployed (see [docs/roadmap.md](../../docs/roadmap.md)).

## Entities

| Entity | What it is |
| --- | --- |
| `Agent`, `Edge`, `MemorySlot`, `Propagation` | Current state, each with its `owner` |
| `AuditEvent` | One flat row per audit page line, newest first by `block`, `logIndex` |
| `Edge.propagationCount`, `lifetimeSeconds` | Memories that travelled along an edge; how long a revoked edge lived |
| `AgentStats`, `TopicStats`, `OwnerStats` | Counters per agent, per owner and topic, per owner |
| `PolicyViolation` | A `Propagate` that no active, unexpired edge explains. Expected to stay empty |

Three contract gaps are closed in the handlers (ADR-025): `EdgeRemoved` has no from, to or topic (read from the stored edge), `Propagate` has no slot id (joined by tx hash, sender and content hash) and `MemoryWritten` has no propagated count (counted from `Propagate` logs).

## Commands

```bash
pnpm --filter @hive/shared build      # the sync script and tests import it
pnpm --filter @hive/indexer sync      # abis/*.json from @hive/shared, checks config.yaml addresses
pnpm --filter @hive/indexer test      # envio codegen, then vitest (no database needed)
pnpm --filter @hive/indexer dev       # local indexer + GraphQL, needs Docker and ENVIO_API_TOKEN
```

`ENVIO_API_TOKEN` (HyperSync) is created at <https://app.envio.dev/api-tokens>. Put it in `.env`, not in git.

## Contract changes

The contracts were redeployed once (ADR-021). After another redeploy: run `pnpm --filter @hive/contracts abi`, then `pnpm --filter @hive/indexer sync`, update `start_block` and the addresses in `config.yaml` (the test fails until they match `@hive/shared`) and redeploy the indexer.

## Deploy (Envio Cloud)

Connect the GitHub repo in Envio Cloud, set the root directory to `packages/indexer`, the branch to `development`, and add `ENVIO_API_TOKEN` as a secret. The public GraphQL URL goes in `NEXT_PUBLIC_ENVIO_URL` for the web app.
