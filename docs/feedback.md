# DX feedback (agent layer)

Running notes on friction with the MCP SDK, tooling and Monad, for the team feedback doc. Newest first.

## 12 Oct 2026

- **One account can reach Hive by two routes, and nothing said which identity the AI used.** A Claude Desktop connector belongs to the account, so a Claude Code session with no local `hive` server for its own agent wrote as the connector's agent (11 Oct, agent 20 instead of 21). The bridge was right, since identity comes from the token. Every successful tool result now carries `as: { agentId, name }` and the server instructions tell the agent to say it, so a wrong identity shows in the first answer. Not yet seen with a real client.

## 10 Oct 2026

- **Monad charges the declared gas limit, so "enough MON" depends on the limit, not on what a call uses.** One `MemorySlots.write` estimated at 253k gas, our 125% margin declared 317k, and at 102 gwei that is 0.0323 MON. A key with 0.0318 MON was refused. A gas-needed figure in the RPC error, or a documented formula for the minimum balance, would have saved the hunt.
- **An empty balance comes back as a generic invalid-params error, not as the error viem maps to `InsufficientFundsError`.** The text is "Signer had insufficient balance". Both the web client and the bridge had to match the message to give a useful answer, and the web client's version existed long before the bridge's.
- **Next.js reads `.env` only from the app folder, so `NEXT_PUBLIC_HIVE_MODE=live` in the root `.env` was ignored and the web app ran in mock mode.** `next dev` defaults to mock, and the only hint was a small "Demo data" badge. A mock-mode banner at startup, or an `apps/web/.env.local` line in `.env.example`, would have caught it earlier.
- **A contract and its client disagreed about a wildcard, and the contract cannot be patched.** The bridge treats an edge topic `*` as "every topic", the deployed `PropagationEngine` compares exact hashes, so `propagatedTo` stayed empty on the default edge. Fixing it means a redeploy, and because `MemorySlots` holds the engine as `immutable`, three contracts move together and edges and slots reset. A mutable engine pointer, or settling the matching rule before the first deploy, would have made this a one-line change.
- **`vitest` does not type-check.** A new option declared on the wrong type passed all 142 tests and failed `tsc`. `pnpm build` and the tests are separate steps and both have to run; the AGENTS.md line says so, but it is easy to run only one.
- **Our own failure log said nothing about the cause.** `bridge: write failed at chain` hid whether the key was out of gas, the RPC was rate limited or the call reverted. Messages can carry addresses, so the log now adds only the error's class name.
- **The Connect page kept its "no MON for gas" error after the faucet had paid.** The balance in the wallet menu was already 10 MON. Re-checking the balance when the user comes back, instead of waiting for "Try again", would remove the doubt. It happened again on 11 Oct with 1 MON in the account, and the same registration went through about 14 minutes later; we did not find the cause. The page now sends nothing on load and shows the balance (ADR-030).
- **Fixed prompts make an MCP run repeatable.** "Call `hive_write_memory` with topic X and content Y and print the raw JSON" gave the same shape every time in Claude Code, which turned a manual check into a script a teammate can follow. We recommend keeping the six prompts of the 10 Oct run in the demo notes.

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
