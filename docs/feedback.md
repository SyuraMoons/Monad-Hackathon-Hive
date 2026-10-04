# DX feedback (agent layer)

Running notes on friction with the MCP SDK, tooling and Monad, for the team feedback doc. Newest first.

## 3 Oct 2026

- **Stacked PRs merged on GitHub leave the local base branch stale, silently.** Six merged PRs and the local `development` still looked empty. A "fetch and fast-forward before you start" line in AGENTS.md now covers it.
- **Deployed contracts lived on an unmerged branch for days.** `development` had only `Counter.sol` while the contracts were already on testnet. Landing deployments (ABIs and addresses in `@hive/shared`) separately from the rest of a feature branch would have unblocked the bridge earlier.
- **A "sponsored gas" UI claim outlived the decision that backed it.** ADR-002 said sponsored, ADR-006 says faucet EOA, and the web copy still says sponsored. Decisions that change UI copy need a grep of the copy in the same PR.

## 2 Oct 2026

- **Mera's default PRF salt is stable (`sha256("mera.prf.salt.v1")`, documented in the `getPasskeyPrfOutput` JSDoc).** That makes PRF output a safe source of BIP-39 entropy. The docs site should say this on the PRF concept page too; we found it only in the `.d.ts`.
- **Mera's built-in WebAuthn client can't be cancelled.** There is no `signal` option, so a "Cancel" button needs a custom `WebAuthnClient` that passes `AbortSignal` to `navigator.credentials`. An `AbortSignal` option would remove ~60 lines.
- **Secret vaults need a second prompt to sign in.** A vault's salt is random, so its owner can't be found until the passkey answers once (to learn the credential ID) and then again (to decrypt). A documented "vault keyed by the default salt" pattern, or returning PRF for two salts in one ceremony (`eval.second`), would make it one prompt.
- **`@modelcontextprotocol/sdk` 1.31 works for a custom Streamable HTTP server on Node 22/24.** Stateless mode (`sessionIdGenerator: undefined`, `enableJsonResponse: true`) with one `McpServer` per request needs no session bookkeeping, which suits a bridge that identifies the agent from a bearer token. `registerTool` takes a zod raw shape, so the shared zod 4 schemas plug in directly. Tool results should carry `structuredContent` as well as text. Both must be JSON-safe: uint256 values (`bigint`) need converting to decimal strings first.
- **KnowledgeGraph stores `keccak256(topic)` only.** The bridge can check permissions from the hash, but can't show a readable topic list (`hive_whoami.readableTopics`) without reading `EdgeAdded` logs or Envio. Worth a topic string in the `Edge` struct or an event-backed reader.
- **`msg.sender == writer` on `MemorySlots.write`** forces every agent key to hold MON unless the bridge relays. Needs a team decision (see `docs/backend-handoff.md` §2, #4).

## 1 Oct 2026

- A global `pnpm` 9 on PATH silently ignores `packageManager: pnpm@11` and offers to wipe `node_modules`. `corepack enable pnpm` fixes it.
- `pnpm build` failed completely when `forge` was missing, even though the other workspaces were healthy. `brew install foundry` gives 1.8.3, the version the contracts use.
- Interfaces drifted from the PRD/SRS (port 4000 vs 8090, `hive_whoami` instead of `hive_register_agent`, `/health` fields, event name `Propagate`). A single "frozen interfaces" table in the repo would save a lot of cross-checking.
