@AGENTS.md

## Claude Code notes

- Verify before claiming done: `pnpm build` plus the tests of the workspaces you touched. Report failures as they are.
- Use `corepack pnpm ...` if `pnpm -v` is not 11.x. Don't `pnpm install` with a global pnpm 9 in this repo.
- Read `packages/shared/src/schema/*` before touching the bridge or the web client; that is the contract.
- Private working notes (`docs/rules.md` and friends) and `CLAUDE.local.md` are gitignored. Don't copy their content into tracked files.

## Learned in practice (12 Oct 2026)

Details are in [docs/gotchas.md](docs/gotchas.md) ("Testing the canvas", "Agents in two terminals"), [docs/feedback.md](docs/feedback.md) and [docs/manual-test-two-agents.md](docs/manual-test-two-agents.md).

- **Don't touch a dev server you didn't start.** `.env.local` here is `live`. For the mock, start another one: `NEXT_PUBLIC_HIVE_MODE=mock NEXT_DIST_DIR=.next-mock pnpm --filter @hive/web exec next dev --turbopack -p 3417`, and kill it when done. `pnpm build` rewrites `.next` under a running `next dev`; use `NEXT_DIST_DIR` for builds beside it. `next dev` edits `apps/web/tsconfig.json`: restore it before you commit.
- **You can drive the canvas yourself.** A Playwright virtual authenticator (CDP `WebAuthn.addVirtualAuthenticator`, `hasPrf: true`) completes the Mera ceremony on `localhost`, so a browser check does not need the user's passkey. Test credentials only, local host only, never the deployed site. `?mock=stress&agents=8&pace=1200` gives a busy scene.
- **A browser check counts only if you read the state first.** Our first all-topics check passed while the old edge was still active and the mock could not carry `*`. List the edges before and after, and choose a case only the thing under test can carry. If you find your own check was wrong, fix the PR description and say so in it.
- **When the user runs two agents and a read comes back empty, check identity first.** Two terminals with the same agent command are one agent. Look at the session name, `hive_whoami` and the `as` field before you suspect permissions.
- **The mock mirrors the contracts.** If you change a rule in the bridge or the permission check (here: `*` covers every topic), change `apps/web/lib/hive/mock` too, or the mock hides the bug.
- **Say what you did not check.** Put "Checked" and "Not checked" in the PR, and don't tick a roadmap item for something seen only in the mock or in tool output (the pulse on the live path is still open).
- **Branches and the working tree.** One layer per PR. If the tree has someone's unfinished work, `git stash push -u -m "<what>"` before you switch, tell them it is there, and split a file with mixed hunks instead of committing it whole. A docs PR that touches `docs/feedback.md` goes on top of the feature PR, or both will conflict on the first lines. Open the PR and say what still needs a person (a redeploy, a live run).
- **Don't redeploy the bridge before a demo.** Sessions and OAuth state are in memory. See "Before a demo or a recording" in [docs/deployment.md](docs/deployment.md).


## Archived plans and handoff (removed from `docs/` on 13 Oct 2026)

`docs/backend-handoff.md` and `docs/memory-viewer-plan.md` were internal planning notes, now done or superseded. What still matters is below. The full originals are in git history: `git show 6abf128:docs/backend-handoff.md` and `git show 6abf128:docs/memory-viewer-plan.md`. For the live API, use the bridge's Swagger UI at `/docs`; for the decisions, `docs/decisions.md`.

### Backend handoff (written 30 Sep, before the backend existed)

- **The contract is `packages/shared`**: `src/ids.ts` (ids and `Topic` `^[a-z0-9-]{1,31}$`), `errors.ts` (error envelope), `schema/api.ts` (every `/v1` body, `authMessage(owner, nonce)`), `schema/events.ts` (the SSE union), `schema/mcp.ts` (the six tools), `schema/graph.ts` (Envio shapes), `chain.ts` (`monadTestnet`, Monadscan links). Import them, don't redefine them. `apps/web/lib/hive/types.ts` (`HiveClient`) is the web side, and `lib/hive/mock/` shows what each call returns.
- **Decisions the handoff asked for, and how they ended:** edge id is a `uint256` counter; topics are `string` in args and events with `keccak256` in storage; an agent is registered with two calls, `register` then `setAgentWriter` (plus an optional ERC-8004 identity, ADR-028), and whether that becomes one call is still open; the agent key sends `MemorySlots.write` and the bridge funds it (ADR-007); the propagation event is `Propagate`; gas is the Mera EOA, faucet-funded (ADR-006); the demo domain is the Vercel site, because a passkey's `rp.id` is the domain (`docs/deployment.md`).
- **Indexer gaps** the handoff named: `MemoryWritten` has no `propagatedCount` (count `Propagate` per slot) and `EdgeRemoved` has no `from/to/topic` (join them from the `Edge` entity). Entities: `Agent`, `Edge` (`active`, `expiresAt`, `addedTx`, `removedTx`), `MemorySlot`, `Propagation`. The web reads three shapes: `zGraphSnapshot` (canvas load), `zAuditEvent[]` (audit table), `zProvenance` (by `contentHash`).
- **Bridge routes** (port 4000, JSON validated with the shared zod schemas): `GET /health`; `POST /v1/auth/challenge` (nonce, 5 min) and `/v1/auth/verify` (rebuild `authMessage`, viem `verifyMessage`, HS256 JWT 24 h `{ sub: owner, typ: "user" }`); `GET /agents/:id/card.json` (public, ERC-8004 card from `AgentRegistry` only); `GET /v1/agents`; `POST /v1/agents/:id/authorize` (reject unless the token's owner owns the agent and the key matches; keys live in memory); `DELETE /v1/agents/:id/session` and `DELETE /v1/sessions` (sign out, publishes `agent.disconnected`); `GET /v1/memory/:contentHash`; `GET /v1/events?token=` (SSE; `EventSource` cannot send headers, so the token is in the query; `Last-Event-ID` replays up to 100 events per owner, in memory only); `POST /mcp` (agent bearer token; the agent comes from the token, never an argument).
- **Events:** `memory.written` (with `propagatedTo` from the receipt), `memory.read` (only when a read returned something), `agent.connected` (first MCP call; re-authorizing keeps the first-call time), `agent.disconnected`. `session.expiring` is planned, not sent.
- **Encryption the web decrypts:** AES-256-GCM, 12-byte IV, 16-byte tag appended to the ciphertext, `contentHash = keccak256(iv ‖ ciphertext)`, never a hash of plaintext. Permission checks read live chain state on every list and read, never Envio, so a revoke is immediate.
- **Storage:** Supabase `memory_content (content_hash pk, owner, ciphertext, iv, key_id, created_at)`, bridge only with the service role (RLS denies everyone else); `SupabaseCiphertextStore` in `apps/bridge/src/store.ts`, with an in-process fallback when the keys are unset.
- **Web env for live mode:** `NEXT_PUBLIC_HIVE_MODE=live`, `NEXT_PUBLIC_BRIDGE_URL`, `NEXT_PUBLIC_ENVIO_URL`, `NEXT_PUBLIC_PASSKEY_RP_ID`, `NEXT_PUBLIC_EXPLORER_URL`. Mock mode flags: `?mock=tx-fail,bridge-offline,no-agents,stress,low-balance`; production builds refuse mock mode.

### Memory viewer plan (built and merged; ADR-024)

- **Goal:** the owner reads their own agents' memories in the canvas drawer. The browser already holds `encryptionKey` (HKDF `hive/encrypt`, the key the bridge seals with; memory only, locked after a reload until `unlock()` with one passkey touch), so the bridge serves ciphertext and never decrypts for the user. No hard rule is affected: no plaintext in a log, error, SSE event or row.
- **Bridge:** `GET /v1/memory/:contentHash`, user token only (agent tokens refused), hash checked with `zContentHash`, row returned only when `owner` matches (a missing row and someone else's row are the same `NOT_FOUND`), response `zMemoryResponse` (base64 `ciphertext`, `iv`, `keyId`), `Cache-Control: private, no-store`. `CiphertextStore.getOwned` returns `owner` and `keyId`; `get` is unchanged. New routes must be added to `src/openapi.ts`.
- **Web:** `@hive/crypto` in `apps/web` and `transpilePackages`; `keyIdOf` shared through `@hive/crypto`; live `memory.preview(hash)` fetches, checks `keyId`, decrypts and runs `openDoc` (errors: `LOCKED` offers Unlock, "sealed with another key", "couldn't read"); previews are `MemoryDoc`-shaped, in memory only and cleared on sign-out; the drawer shows the gist or the first ~160 characters and expands on click, with one "Unlock to read" button when locked.
- **Out of scope:** editing or deleting (`MemorySlots` is append-only), search from the canvas, memories other agents shared into this one (needs a permission-aware read path).
