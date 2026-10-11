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
- **The public RPC limits `eth_getLogs` to a 100-block range** (`testnet-rpc.monad.xyz` answers 413, code -32614). Rebuilding edges and their topic names from `EdgeAdded` logs needs an indexer (Envio) or an RPC without that limit. The indexer is `packages/indexer`; HyperSync needs `ENVIO_API_TOKEN` (an unauthenticated query answers "Your token is malformed").
- **The claude.ai connector URL comes from the bridge that authorized the agent.** From `localhost:3000` it is `http://localhost:4000/mcp`, which claude.ai can't reach. Connect from the deployed site, and set `BRIDGE_PUBLIC_URL` and `BRIDGE_WEB_URL` on the bridge or OAuth stays off ([deployment.md](deployment.md)).
- **Bridge events and sessions are in memory.** `/v1/events` history and agent sessions are gone after a bridge restart (`pnpm dev` restarts it on every bridge edit). Open `/connect` again to re-authorize.

## Web session

- A reload keeps you signed in (live mode) but locked: the keys are derived again from the passkey, and the Connect page shows "Unlock with passkey" until then. Mock mode still goes to `/login`.
- The saved session is the 24h user token, fixed from sign-in. It does not slide forward with use.
- Sign out clears this browser only. Another tab stays signed in until it reloads, because the bridge does not revoke user tokens.
- After a bridge restart the user token still works, but agent sessions are gone: authorize the agents again. On the canvas, open the agent's drawer and press **Reconnect** (one passkey touch). A token under 24h old works again with no new command, so run `/mcp` in Claude Code. Only a token older than 24h needs the new command from `/connect`.
- Several agents in one folder: create each from the canvas sidebar ("+ New agent") or on `/connect`, two transactions that cost gas, then start one terminal per agent with its "terminal" command (`claude -n hive-<name> --mcp-config '<json>'`). The config lives in that terminal only. `claude mcp add` (the "folder" command) saves one `hive` server per folder, so every session there is one agent. Don't use both in a folder: remove the folder entry with `claude mcp remove hive`. Not yet tried against a real Claude Code.
- Live edges: the canvas signs `addEdge` / `removeEdge` with the owner key (one passkey touch after a reload) and reads edges with `KnowledgeGraph.edgesFrom`. The chain keeps only `keccak256(topic)` and no transaction hash, so the topic text is recovered from `brain`, the edges signed in this browser (`localStorage`, `hive:edges:<owner>`) and the topics the agents wrote to. An edge whose topic can't be recovered is drawn as `unknown` and can still be revoked, and an edge made in another browser has no transaction link. Edges are one direction, and cover one topic or, by default, all topics (`*`, ADR-013). Built, not yet run on testnet.
- Registering an agent is two transactions (`register`, then `setAgentWriter`). If the page is reloaded between them the agent exists with no writer key and the bridge refuses to authorize it. The drawer and Connect show "Finish setup", which sends only the second transaction. Agent tokens are kept in `sessionStorage` for the life of the tab, so a reload keeps the commands. Not yet run in a browser.
- The agent drawer's memory history comes from `MemorySlots.slotsSince`. Slots store no transaction hash, so rows show the content hash and no explorer link, and the text of an old memory is not shown (live writes of this session are).
- "Remove from canvas" only hides the agent on this browser (`hive:hidden:<owner>`): it stays registered on Monad and shows again on another browser, because `AgentRegistry` has no delete. The sidebar lists hidden agents with a Show button. A hidden agent is skipped by Connect, so it is not authorized again by accident.

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

## Memory

- **An agent does not read its own writes by default.** `hive_read_memory` returns only notes from other agents that have an edge to the reader (`apps/bridge/src/memory.ts`). `mine: true` reads the caller's own slots (ADR-022). A `hive_save_session` is for the other agents. Draw an edge with "All topics" (the editor default, ADR-013) to share everything, or one for `general` (the default save topic, ADR-014). An all-topics edge gives reads but no propagation pulse (planned, needs a contract redeploy).
- **Search embeddings need three things.** `HIVE_EMBEDDINGS=on`, the `memory_embedding` migration applied to Supabase, and room for the model (about 120 MB download, loaded in the background; `/health` shows `embeddings`). Without any of them search still works on words. `pnpm-workspace.yaml` sets `onnxruntime-node` and `protobufjs` to `false` in `allowBuilds`: the CPU runtime needs no install script. Old slots are embedded the first time a search sees them, 20 per call, the rest in the background.
- **A call looks at 500 slots at most.** Read, list and search open the newest 500 slots an agent may read (`CANDIDATES_MAX`); older ones are out of reach of search and of a bare list. With a `cursor` the window is the oldest 500 after it, so a larger backlog drains over several calls: keep calling while `more` is true.
- **Each write is a transaction.** About 0.01 MON or more per save at the current gas price, paid by the agent key. The bridge tops a key up only at authorize, so many saves can run it dry ("The agent key has no MON for gas.").
