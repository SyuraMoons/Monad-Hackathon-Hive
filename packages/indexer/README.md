# @hive/indexer

Envio HyperIndex for Hive's audit trail on Monad testnet (chain 10143). It turns the four contracts' events into a queryable history: who registered which agent, which edge allowed whom to read which topic, which memory was written and where it went, plus derived stats and a check that nothing was delivered without an active edge.

It is for history and display only. Permission checks never read it: the bridge reads live chain state (AGENTS.md rule 3). Everything it stores is already public onchain (agent names, topic text, content hashes), never memory plaintext.

Status: tested with simulated events and synced locally against testnet on 11 Oct 2026. Not yet deployed to Envio Cloud (see [docs/roadmap.md](../../docs/roadmap.md)).

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

Needs Node 22.15 or newer (Envio 3). Docker is only for running it locally.

```bash
pnpm --filter @hive/shared build      # the sync script and the drift test read its build
pnpm --filter @hive/indexer sync      # abis/*.json from @hive/shared, checks config.yaml addresses
pnpm --filter @hive/indexer test      # envio codegen, then vitest (no database, no token)
pnpm --filter @hive/indexer dev:local # local Postgres + Hasura + indexer; needs Docker and a token
```

Local run:

1. Create a HyperSync token at <https://envio.dev/app/api-tokens>.
2. Put it in `packages/indexer/.env` as `ENVIO_API_TOKEN=...`. Envio reads `.env` from the indexer folder, not the repo root, and the file is gitignored.
3. Start Docker, then `pnpm --filter @hive/indexer dev:local`. Hasura opens at <http://localhost:8080> (password `testing`).
4. After a change to `config.yaml`, `schema.graphql` or an ABI, restart with `pnpm --filter @hive/indexer exec envio dev -r` to re-index from `start_block`.

The script is `dev:local`, not `dev`, so the root `pnpm dev` does not start the indexer: it needs Docker and a token, and the web and the bridge run without it.

`ENVIO_TUI=false` turns the terminal UI off (it is off by default in CI).

If something else already listens on port 5433, Envio takes it for its own Postgres, starts none, and hangs at "Waiting for Hasura". Pick another port: `ENVIO_PG_PORT=5439 pnpm --filter @hive/indexer dev:local`.

## Why nothing here imports the workspace

Envio Cloud builds this folder on its own and asks that every import stays inside it. So the handlers import only `envio` and local files, `tsconfig.json` does not extend the repo's base config, and `@hive/shared` is not a dependency: the sync script and the drift test read its build by relative path, on a developer machine only.

## Contract changes

The contracts were redeployed once (ADR-021). After another redeploy: run `pnpm --filter @hive/contracts abi`, then `pnpm --filter @hive/indexer sync`, update `start_block` and the addresses in `config.yaml` (the test fails until they match `@hive/shared`) and push: Envio Cloud re-indexes from the start block on every deploy.

## Deploy (Envio Cloud)

1. Sign in at <https://envio.dev/app> with GitHub and install the Envio Deployments app on the repo.
2. Add an indexer: root directory `packages/indexer`, config file `config.yaml`, deployment branch `development`.
3. No token is needed there: Envio Cloud provides HyperSync access itself. Any variable you do add must start with `ENVIO_`.
4. Every push to the deployment branch builds a new version. The old one serves queries until the new one has synced.
5. Copy the GraphQL endpoint into `NEXT_PUBLIC_ENVIO_URL` for the web app.

Envio Cloud builds with pnpm 10.32 and recommends Node 24. The repo pins pnpm 11; a local install of this folder with pnpm 10.32 switches to the pinned version and works, but that has not been run on Envio Cloud yet. The free plan stops at 100,000 processed events or 7 days without a request, and keeps 3 deployments per indexer.
