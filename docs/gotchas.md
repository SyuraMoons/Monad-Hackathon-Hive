# Gotchas

Known pitfalls. Add to this list when you hit a new one.

## Passkeys (Mera)

- **Desktop Chrome returns PRF output only for Google Password Manager passkeys.** A passkey saved locally in Chrome fails with `PRF_UNAVAILABLE`. For the demo, use Safari + iCloud Keychain, 1Password, or Chrome + Google Password Manager.
- **Passkeys are tied to a domain (`rp.id`).** A passkey created on `localhost` won't work on the Vercel URL, and vice versa. Pick the demo domain early and don't change it. Moving domains means restoring from the 24-word recovery phrase (wallet menu → Show recovery phrase).
- **A secure context is required.** Use HTTPS or `localhost`, or you get `CRYPTO_UNAVAILABLE`.
- Call `session.end()` when you're done signing. After that, the session throws `SESSION_ENDED`.
- **There is no mock passkey.** `pnpm dev` runs a real Mera ceremony even with `NEXT_PUBLIC_HIVE_MODE=mock`, so dev needs a PRF-capable passkey too. On sign-in the mock backend hands its demo agents to your passkey's keys.

## Monad

- **Gas is charged on the declared gas limit, not the gas actually used.** Always pass an explicit `gas`, and don't rely on inflated estimates.
- Testnet chain ID is `10143` (`monadTestnet` in viem). Mainnet is `143`. Import it from `@hive/shared`.
- **A failed broadcast still writes `deployments/monad-testnet.json`.** `vm.writeJson` runs during the pre-broadcast simulation, so a run that dies on gas still leaves (wrong) addresses on disk. Confirm `cast code <addr> --rpc-url monad_testnet` returns bytecode before trusting or committing it.
- **`forge script` takes `DEPLOYER_PRIVATE_KEY` from the process environment.** The repo has no committed `.env` (it's gitignored), so export it in the shell (`$env:DEPLOYER_PRIVATE_KEY = "0x…"`) or create `packages/contracts/.env` before deploying. Foundry resolves `.env` relative to `foundry.toml`, not the monorepo root.
- **The dev signer (`NEXT_PUBLIC_HIVE_DEV_SIGNER_PRIVATE_KEY`) is `NEXT_PUBLIC_`, so it ships inside the client bundle.** Testnet only — never fund it.
- **The bridge needs MON on every agent key.** `MemorySlots.write` is sent by the agent's writer key (ADR-007). A write from an unfunded key fails with a chain error, not a permission error.
- **Topics are stored as `keccak256(topic)`.** Permission checks work from the hash, but readable topic names exist only in `EdgeAdded` logs (or Envio). `AgentRegistry` has no "agents of owner" view either: list them from `AgentRegistered` logs filtered by the indexed `owner`.
- **The public RPC limits `eth_getLogs` to a 100-block range** (`testnet-rpc.monad.xyz` answers 413, code -32614). Rebuilding edges and their topic names from `EdgeAdded` logs needs an indexer (Envio) or an RPC without that limit.
- **Bridge events and sessions are in memory.** `/v1/events` history and agent sessions are gone after a bridge restart (`pnpm dev` restarts it on every bridge edit). Open `/connect` again to re-authorize.

## Tooling

- **Clone with submodules:** `git clone --recurse-submodules`, or run `git submodule update --init` afterwards. Otherwise `forge build` fails because `forge-std` is missing.
- **pnpm 11 blocks dependency install scripts by default.** Allowed packages are listed under `allowBuilds` in `pnpm-workspace.yaml`. If a new dependency needs a postinstall (e.g. `esbuild`), add it there.
- `@hive/shared` is consumed from `dist/`. `pnpm dev` builds it first, but if you run a single app with `--filter`, run `pnpm --filter @hive/shared build` first.
- **A global `pnpm` on PATH may be v9.** It ignores `packageManager: pnpm@11.2.2` and offers to wipe `node_modules`. Run `corepack enable pnpm` once.
- **`pnpm build` needs Foundry.** Without `forge`, turbo stops at `@hive/contracts` before building the other packages. `brew install foundry` gives 1.8.3, and the submodule must be initialised.
- **Express 5 types:** a function returning `express()` needs an explicit `Express` return type under pnpm, or `tsc` reports TS2742.
- **uint256 in JSON:** `bigint` throws in `JSON.stringify`. Send decimal strings (see `@hive/shared` ids) and convert at the edge.
- **Merged stacked PRs leave your local `development` stale.** GitHub merges each PR into `origin/development`, your local branch doesn't move. Before you start, run `git fetch && git merge --ff-only origin/development`, or you will think code is missing (this cost us an hour: the bridge looked unbuilt).
- **Never rename the HKDF string `hive/encrypt`,** not even in the Mindshare rename (ADR-008).

