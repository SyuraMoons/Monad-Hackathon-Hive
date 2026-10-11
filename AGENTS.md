# AGENTS.md

Instructions for AI coding assistants (Claude Code, Cursor, Codex, …) working in this repo. Read this before making changes.

## What this is

Hive is a visual permission layer for AI agent memory. Users draw edges between agents on a canvas. Edges are signed with a Mera passkey and stored on Monad testnet. Memory content is stored encrypted offchain. Background: [README.md](README.md) and [docs/architecture.md](docs/architecture.md).

## Commands

```bash
corepack enable pnpm                  # once: the repo pins pnpm 11 (a global pnpm 9 silently ignores it)
pnpm install                          # install all workspaces
pnpm dev                              # web :3000, bridge :4000, agents, shared (watch)
pnpm build                            # build everything (turbo), including forge build
pnpm lint                             # lint (web only for now)
pnpm -r --if-present test             # unit tests: shared, crypto, bridge, web, contracts
pnpm --filter @hive/web dev           # run a single workspace
cd packages/contracts && forge test   # contract tests
```

Run `pnpm build` and the tests of what you touched before you say a change is done. Prerequisites: Node 22+ (`.nvmrc`), Foundry (`brew install foundry`, 1.8.x) and the submodule (`git submodule update --init`), otherwise `pnpm build` fails at `@hive/contracts`.

## Workspace map

| Package | Path | Notes |
| --- | --- | --- |
| `@hive/web` | `apps/web` | Next.js 15 App Router, React 19, Tailwind v4. Path alias `@/*`. |
| `@hive/bridge` | `apps/bridge` | Node ESM, run with `tsx`. Express 5 HTTP API and MCP server. See "Bridge" below. |
| `@hive/agents` | `apps/agents` | Node ESM, run with `tsx`. The DeepSeek runner (ADR-020). |
| `@hive/shared` | `packages/shared` | Compiled with `tsc` to `dist/`. Chain config, ABIs, types. |
| `@hive/crypto` | `packages/crypto` | AES-256-GCM `encrypt` / `decrypt` / `contentHash`. Same layout the web decrypts with WebCrypto. |
| `@hive/contracts` | `packages/contracts` | Foundry. `forge-std` is a git submodule in `lib/`. |
| `@hive/mcp-client` | `packages/mcp-client` | Typed MCP client for the bridge, used by the agent runner. |
| `@hive/indexer` | `packages/indexer` | Envio HyperIndex for the audit trail. Imports nothing from the workspace (Envio Cloud builds the folder alone). Run with `dev:local`, not the root `pnpm dev`. |

Internal dependencies use `"workspace:*"`. The web app consumes `@hive/shared` through `transpilePackages` in `next.config.ts`.

## Hard rules

1. **Auth is Mera only.** Do not add Privy, RainbowKit, wagmi connectors, or any other auth or wallet provider. See [ADR-001](docs/decisions.md).
2. **Memory plaintext is never stored or logged in the clear.** Supabase stores only ciphertext. Anything derived from content counts as plaintext: previews, gists, entities, embedding vectors and search queries. Onchain go content hashes plus metadata that is public by design: topic names (`MemorySlots`) and agent names and types (`AgentRegistry`), so never put anything sensitive in a topic or an agent name. The bridge holds the owner's delegated key and may keep decrypted memories in process memory for at most the life of an agent session. It must never put plaintext in a log, an error, an SSE event or a database row. An authorized read hands plaintext to the reading agent and its model provider; docs and UI must not claim otherwise. See ADR-023 and the trust model in [docs/architecture.md](docs/architecture.md).
3. **Only the onchain permission graph decides what an agent may read.** Deterministic code checks it on live chain state before any fetch, decrypt or ranking, and any doubt means no data. LLMs, embedding models and fields an agent wrote (`gist`, `kind`, `supersedes`) may rank or hide memories inside the permitted set, never widen it, and one agent's fields never affect another sender's memories.
4. **Chain config and ABIs come from `@hive/shared`.** Don't hard-code chain IDs, RPC URLs, or contract addresses in apps.
5. **Always set explicit `gas` on Monad transactions.** Monad charges the declared gas limit, not the gas actually used.
6. **Build one layer at a time.** Don't scaffold future layers or add speculative abstractions. Check [docs/roadmap.md](docs/roadmap.md) for the current step.
7. **No secrets in git.** Put config in `.env` and add new keys (without values) to `.env.example`.
8. **Don't overclaim.** Docs and UI must mark unfinished features as planned.

## Decisions in force

Short list, details in [docs/decisions.md](docs/decisions.md) and [docs/gotchas.md](docs/gotchas.md).

- **Gas:** testnet, the Mera EOA pays and is faucet-funded (ADR-006). Don't write "sponsored" in UI or docs.
- **Writes:** the agent key sends `MemorySlots.write`; the bridge funds that key (ADR-007).
- **Name:** the product is Mindshare, the code still says Hive until one scripted rename PR (ADR-008). Never rename the HKDF string `hive/encrypt`, nor the memory namespace's `hive/prf/memory/v1` and `hive/memory-key/v1` (ADR-029).
- **Demo agents:** Claude, ChatGPT and DeepSeek (several named agents of each type are allowed, ADR-012). DeepSeek connects through a local runner in `apps/agents` and is planned until a live run is recorded (ADR-020).
- **Before you start:** `git fetch && git merge --ff-only origin/development`. Stacked PR merges leave local `development` stale.

## Conventions

- TypeScript strict mode everywhere, and ESM (`"type": "module"`) in Node packages.
- Match the style of the file you're editing. Keep comments sparse.
- Branches and commits: see [docs/contributing.md](docs/contributing.md) (conventional commits).
- If you record a new architectural decision, add an ADR to [docs/decisions.md](docs/decisions.md).
- Known pitfalls are in [docs/gotchas.md](docs/gotchas.md). Read them before touching passkeys or transactions.

## Bridge (`apps/bridge`)

- **The interface is defined in `@hive/shared`** (`schema/api.ts`, `schema/mcp.ts`, `schema/events.ts`, `errors.ts`), not in the PRD. Where they differ, shared wins: port **4000**, MCP tools `hive_write_memory`, `hive_list_memory` (gist and preview, no full content), `hive_read_memory` (newest 20 by default, `slotIds` to pick), `hive_search_memory` (ranked previews, ADR-022), `hive_save_session` (the agent's own compact summary, default topic `general`), `hive_whoami` (no `register` tool: agents are registered by the user from the canvas), `/health` fields per `zHealthResponse`. Don't change a shape the web or the mock agents already use without telling their owners.
- **JSON has no `bigint`.** uint256 values (`agentId`, `slotId`, `edgeId`) are decimal strings on the wire and `bigint` in TS. Convert before `JSON.stringify` and before MCP `structuredContent`.
- **Identity comes from the token, never from an argument.** User tokens (`typ: "user"`) are for `/v1/*`, agent tokens (`typ: "agent"`) plus a live in-memory session are for `/mcp`. Each is refused on the other's routes. Agent keys live in `SessionStore` memory only.
- **Default deny.** `permissions.ts` mirrors `KnowledgeGraph.hasPermission`: edge active, `expiresAt > now` (equal means expired), same from / to, and `keccak256(topic)` equals the stored topic hash, or the edge is an all-topics edge (`*`, ADR-013). Any error or doubt returns no data. Permission checks read live chain state, never Envio, so a revoke is immediate.
- **Memory metadata lives inside the ciphertext** (ADR-022): writes may carry `gist`, `kind`, `entities` and `supersedes`, sealed in a `hive-memory/v1` envelope with the content. Reads accept `kind`, `mine`, `cursor` and `includeSuperseded`. `content` in read output stays the raw text. Search embeddings are encrypted with the owner key before they reach Supabase (`memory_embedding`); `HIVE_EMBEDDINGS=on` turns the model on. Never log a query, a gist or a vector.
- **KnowledgeGraph stores only `keccak256(topic)`.** The bridge can verify a topic but cannot list readable topics from the chain alone (`hive_whoami.readableTopics` is a STUB until `EdgeAdded` logs or Envio feed it).
- **`ChainReader` and `CiphertextStore` are interfaces.** `stubs.ts` has in-memory implementations marked `// STUB: replace when <X> lands`. Use the interfaces in tests; don't reach for the real chain or Supabase there.
- **Encryption format:** AES-256-GCM, 12-byte IV, 16-byte tag appended to the ciphertext, `contentHash = keccak256(iv ‖ ciphertext)` (never a hash of plaintext). Use `@hive/crypto`; don't re-implement it.
- **MCP SDK:** `@modelcontextprotocol/sdk` 1.31 works with a stateless `StreamableHTTPServerTransport` (`sessionIdGenerator: undefined`, `enableJsonResponse: true`), one `McpServer` per request. `registerTool` takes a zod raw shape (`schema.shape`). Test it with the SDK's own `Client` over a real port, as `test/mcp.test.ts` does.
- **Express 5 + pnpm:** exported functions that return an Express app need an explicit return type (`: Express`), otherwise `tsc` fails with TS2742.
- **API docs:** Swagger UI at `/docs`, spec at `/openapi.json`, built in `src/openapi.ts` from the `@hive/shared` zod schemas. A new route must be added there: `test/openapi.test.ts` fails if a registered route is undocumented.
- **Errors** use the shared envelope `{ error: { code, message } }`. Messages are fixed strings and never contain request bodies, keys or memory content.
- **Writes and gas** follow ADR-007 and ADR-006 (see "Decisions in force"). Still open ([docs/backend-handoff.md](docs/backend-handoff.md) §2): whether `register` and `setAgentWriter` become one call, and the demo domain (passkey `rp.id`).

## Product name

See ADR-008 and "Decisions in force". Until the rename lands as one PR, keep the existing `@hive/*`, `hive_*` and `HIVE_*` names. Don't rename piecemeal: it breaks every open branch.

## Working with PRs

- Branch off `development` (`feat/`, `fix/`, `chore/`, `docs/`) and open PRs against it. When one PR needs another, stack it on that branch and retarget to `development` after the parent merges.
- One layer per PR, with tests. Commit as yourself with a conventional-commit message. Don't add AI attribution lines to commits or PR descriptions.
