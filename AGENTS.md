# AGENTS.md

Instructions for AI coding assistants (Claude Code, Cursor, Codex, …) working in this repo. Read this before making changes.

## What this is

Hive is a visual permission layer for AI agent memory. Users draw edges between agents on a canvas. Edges are signed with a Mera passkey and stored on Monad testnet. Memory content is stored encrypted offchain. Background: [README.md](README.md) and [docs/architecture.md](docs/architecture.md).

## Commands

```bash
pnpm install                          # install all workspaces
pnpm dev                              # web :3000, bridge :4000, agents, shared (watch)
pnpm build                            # build everything (turbo), including forge build
pnpm lint                             # lint (web only for now)
pnpm --filter @hive/web dev           # run a single workspace
cd packages/contracts && forge test   # contract tests
```

Run `pnpm build` before you say a change is done.

## Workspace map

| Package | Path | Notes |
| --- | --- | --- |
| `@hive/web` | `apps/web` | Next.js 15 App Router, React 19, Tailwind v4. Path alias `@/*`. |
| `@hive/bridge` | `apps/bridge` | Node ESM, run with `tsx`. MCP server and HTTP API. |
| `@hive/agents` | `apps/agents` | Node ESM, run with `tsx`. Mock chatbots for the demo. |
| `@hive/shared` | `packages/shared` | Compiled with `tsc` to `dist/`. Chain config, ABIs, types. |
| `@hive/contracts` | `packages/contracts` | Foundry. `forge-std` is a git submodule in `lib/`. |

Internal dependencies use `"workspace:*"`. The web app consumes `@hive/shared` through `transpilePackages` in `next.config.ts`.

## Hard rules

1. **Auth is Mera only.** Do not add Privy, RainbowKit, wagmi connectors, or any other auth or wallet provider. See [ADR-001](docs/decisions.md).
2. **Memory plaintext never leaves the client unencrypted.** Nothing but hashes goes onchain, and Supabase stores only ciphertext.
3. **Access control is deterministic code.** An LLM never decides whether an agent may read memory. The onchain permission graph does.
4. **Chain config and ABIs come from `@hive/shared`.** Don't hard-code chain IDs, RPC URLs, or contract addresses in apps.
5. **Always set explicit `gas` on Monad transactions.** Monad charges the declared gas limit, not the gas actually used.
6. **Build one layer at a time.** Don't scaffold future layers or add speculative abstractions. Check [docs/roadmap.md](docs/roadmap.md) for the current step.
7. **No secrets in git.** Put config in `.env` and add new keys (without values) to `.env.example`.
8. **Don't overclaim.** Docs and UI must mark unfinished features as planned.

## Decisions in force

Short list, details in [docs/decisions.md](docs/decisions.md) and [docs/gotchas.md](docs/gotchas.md).

- **Gas:** testnet, the Mera EOA pays and is faucet-funded (ADR-006). Don't write "sponsored" in UI or docs.
- **Writes:** the agent key sends `MemorySlots.write`; the bridge funds that key (ADR-007).
- **Name:** the product is Mindshare, the code still says Hive until one scripted rename PR (ADR-008). Never rename the HKDF string `hive/encrypt`.
- **Demo agents:** Claude and ChatGPT only.
- **Before you start:** `git fetch && git merge --ff-only origin/development`. Stacked PR merges leave local `development` stale.

## Conventions

- TypeScript strict mode everywhere, and ESM (`"type": "module"`) in Node packages.
- Match the style of the file you're editing. Keep comments sparse.
- Branches and commits: see [docs/contributing.md](docs/contributing.md) (conventional commits).
- If you record a new architectural decision, add an ADR to [docs/decisions.md](docs/decisions.md).
- Known pitfalls are in [docs/gotchas.md](docs/gotchas.md). Read them before touching passkeys or transactions.
