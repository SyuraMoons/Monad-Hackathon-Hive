# Backend handoff: what the web app expects

Status: 30 Sep 2026. The web app (`apps/web`) is finished against a mock backend: landing, login (real Mera passkey), connect, canvas (edges, signing, revoke, drawer, zones, wallet), and audit. Every screen reads through one interface, `HiveClient`, so plugging in the real services changes no screens. This page lists what each backend owner needs to ship so the web app can switch to live mode, and the decisions to close first.

> The detailed planning notes (`docs/rules.md` and friends) are private working notes and are not in the repo. This page and `packages/shared` are the shared contract.

## 1. Where the contract lives

Everything that crosses a process boundary is defined once in `packages/shared` (from branch `feat/web-data-layer` onwards). Import these; don't redefine them.

| File | What it defines |
| --- | --- |
| `src/ids.ts` | `AgentId`, `EdgeId`, `SlotId` (uint256: decimal string in JSON, `bigint` in TS), `Topic` (`^[a-z0-9-]{1,31}$`), `ContentHash`, `TxHash`, `Address`, `AgentType` (`claude`, `gpt`, `therapy-bot`, `other`), unix-seconds timestamps |
| `src/errors.ts` | `ErrorCode` enum and the error envelope `{ error: { code, message } }` |
| `src/schema/api.ts` | Every `/v1` body and response, plus `authMessage(owner, nonce)`, the exact text the owner signs at login |
| `src/schema/events.ts` | The SSE event union for `/v1/events` |
| `src/schema/mcp.ts` | `hive_write_memory`, `hive_list_memory`, `hive_read_memory`, `hive_search_memory`, `hive_save_session`, `hive_whoami` inputs and outputs |
| `src/schema/graph.ts` | Envio shapes: graph snapshot, audit events, provenance |
| `src/chain.ts` | `monadTestnet`, `explorerTxUrl`, `explorerAddressUrl` (Monadscan) |

`pnpm --filter @hive/shared test` runs the schema tests (18 passing).

The web side of the interface is `apps/web/lib/hive/types.ts` (`HiveClient`). `lib/hive/mock/` shows exactly what the web expects each call to return.

## 2. Decisions to close before building

These block the bridge and the indexer. Each needs one answer from its owner.

| # | Question | Current state | Suggested answer | Decides |
| --- | --- | --- | --- | --- |
| 1 | Edge ID type | uint256 counter in Akhnaf's `KnowledgeGraph` | **Decided: uint256** (rules A11) | done |
| 2 | Topic encoding | rules: `bytes32` UTF-8 everywhere. Akhnaf: `string` in args/events, keccak in storage | Keep Akhnaf's `string` (contracts are done and tested). The web already works with plain slugs. Update rules §4. | Akhnaf + Altaf |
| 3 | How an agent's key is registered | rules: `register(name, agentType, agentKey)`. Akhnaf: `register(name, agentType, pubKey)` then `setAgentWriter(agentId, writer)` | One call that takes the agent key address (or derives the writer from `pubKey`). Two calls need the `agentId` from the first receipt, which means two passkey-signed userOps per agent. | Akhnaf |
| 4 | Who sends `MemorySlots.write` | rules O2(a): bridge relayer sends it, agent key signs EIP-712. Akhnaf: the agent key must be `msg.sender` | Pick one now. (a) means one funded relayer and no MON on agent keys. Akhnaf's way means every agent key needs MON. | Akhnaf + Altaf |
| 5 | Propagation event name | rules: `MemoryPropagated`. Akhnaf: `Propagate` | Either is fine; the web shows whichever ships. Pick one and tell Harfi so Envio indexes it. | Akhnaf |
| 6 | Who pays gas | rules/ADR-002: Kernel smart account + Pimlico (user pays nothing). Akhnaf's plan: Mera EOA signs directly, faucet-funded | The UI says "Gas sponsored by Hive". If the EOA path stays, the web turns on the balance/low-balance UI that is already built. | Akhnaf |
| 7 | Demo domain (passkey `rp.id`) | not chosen | Choose before anyone creates a real passkey. Passkeys don't move between domains. | Harfi |

**Status, 3 Oct:** #4 is decided in ADR-007 (the agent key sends the write, the bridge funds it). #5 is settled by the deployed contract: the event is `Propagate`. #6 is decided in ADR-006 (Mera EOA, faucet-funded, so "Gas sponsored" copy in the web must change). #3 and #7 are still open; the deployed `AgentRegistry` has two calls, `register` then `setAgentWriter`.

Smaller contract gaps the indexer must cover: `MemoryWritten` has no `propagatedCount` (Envio counts `Propagate` events per slot), and `EdgeRemoved` has no `from/to/topic` (Envio joins them from the `Edge` entity).

## 3. What each owner ships

### Contracts: Akhnaf

- Deploy to Monad testnet (AK-7) and write the ABIs and addresses into `@hive/shared` (`abi/`, `addresses.ts`). The web must never hard-code addresses.
- Merge `feat/hive-permission-layer` with the shared package from `feat/web-data-layer`. Expect conflicts in `packages/shared/src/index.ts` and `chains.ts` / `explorer.ts` vs `chain.ts`.
- Export measured gas limits (AK-11). Every Monad transaction sets an explicit `gas`.
- Views the bridge needs: `hasPermission(from, to, topic)` (checks expiry), `edgesTo(agentId)`, `agents(agentId)`.

### Bridge: Altaf

Port `4000`. JSON everywhere, validated with the shared zod schemas. Allow the web origin in CORS: in local dev it is `http://localhost:3100`, because port 3000 is taken on the web dev machine.

| Route | Body → response (shared schema) | Notes |
| --- | --- | --- |
| `GET /health` | → `zHealthResponse` | Web polls it every 15 s for the "Monad · connected" dot |
| `POST /v1/auth/challenge` | `zAuthChallengeBody` → `zAuthChallengeResponse` | Nonce, 5 min expiry |
| `POST /v1/auth/verify` | `zAuthVerifyBody` → `zAuthVerifyResponse` | Rebuild the text with `authMessage(owner, nonce)`, check with viem `verifyMessage` (handles ERC-1271/6492). HS256 JWT, 24 h, `{ sub: owner, typ: "user" }` |
| `GET /v1/agents` | → `zAgentsResponse` | The owner's agents with `connected`, `lastCallAt`, `tokenExpiresAt` |
| `POST /v1/agents/:id/authorize` | `zAuthorizeBody` → `zAuthorizeResponse` | Both keys are `0x` + 64 hex. Reject unless `agents(id).owner == token owner` and `address(agentPrivateKey) == agents(id).agentKey`. Keys live in memory only |
| `DELETE /v1/agents/:id/session` | → `204` | Web calls it for every agent on Sign out |
| `GET /v1/memory/:contentHash` | → `zMemoryResponse` | **Built.** User token only. base64 `ciphertext`, `iv` and `keyId`; the web decrypts locally with the same key. Someone else's memory is a 404, the same as a missing one. `Cache-Control: private, no-store` |
| `GET /v1/events?token=` | SSE, each `data:` is a `zHiveEvent` | **Built.** `EventSource` can't send headers, so the user token is in the query. `Last-Event-ID` replays up to the last 100 events per owner. Events live in memory only: a bridge restart drops them |
| `POST /mcp` | MCP over Streamable HTTP, `Authorization: Bearer <agentToken>` | Tools and shapes in `schema/mcp.ts`. The caller's agent comes from the token, never from an argument |

Events the canvas needs (status of the bridge side):
- `memory.written` with `propagatedTo` taken from the receipt's propagation logs. Each target draws a pulse, and `[]` shows "stayed with Claude". **Built.**
- `memory.read` when an agent reads (reads are offchain, so only the bridge knows). **Built**, sent only when the read returned at least one memory.
- `agent.connected` on a token's first MCP call. This turns the Connect page green. **Built.** Authorizing the same agent again for the same owner keeps its first-call time, so a page reload doesn't make it look new.
- `agent.disconnected` when the owner ends the session (`DELETE /v1/agents/:id/session`). **Built.**
- `session.expiring`. **Planned**, not sent yet.

Encryption format the web decrypts: AES-256-GCM with the delegated `encryptionKey`, a 12-byte IV, and the 16-byte tag appended to the ciphertext (WebCrypto's default). `contentHash = keccak256(iv ‖ ciphertext)`. Never a hash of plaintext. Plaintext never goes to Supabase, logs, SSE or errors.

Permission checks read live chain state on every `hive_list_memory` and `hive_read_memory` (never Envio), so a revoke takes effect immediately.

### Indexer and storage: Harfi

Envio entities: `Agent`, `Edge` (`active`, `expiresAt`, `addedTx`, `removedTx`), `MemorySlot` (`propagatedCount`), `Propagation`. The web needs three reads, returned in these shapes:

| Read | Shape | Used by |
| --- | --- | --- |
| The owner's graph | `zGraphSnapshot` | Canvas load and reload in a new browser |
| The owner's events, newest first | `zAuditEvent[]` | Audit table |
| Provenance by `contentHash` | `zProvenance` | Audit card, node drawer |

Supabase (bridge only, service role; RLS denies everyone else): `memory_content (content_hash text pk, owner text, ciphertext bytea, iv bytea, key_id text, created_at timestamptz)`. The bridge reads and writes it through `SupabaseCiphertextStore` (`apps/bridge/src/store.ts`) when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set, and falls back to an in-process store otherwise.

The GPT agent is runbook Step 10a (`apps/agents`): a real OpenAI model that uses Hive only through the bridge's MCP tools.

## 4. Web env vars for live mode

```bash
NEXT_PUBLIC_HIVE_MODE=live
NEXT_PUBLIC_BRIDGE_URL=http://localhost:4000
NEXT_PUBLIC_ENVIO_URL=
NEXT_PUBLIC_ENVIO_WS_URL=
NEXT_PUBLIC_PIMLICO_API_KEY=
NEXT_PUBLIC_PASSKEY_RP_ID=
NEXT_PUBLIC_EXPLORER_URL=https://testnet.monadscan.com
```

## 5. Try the web app today (mock mode)

```bash
pnpm install
pnpm --filter @hive/shared build
pnpm --filter @hive/web exec next dev --turbopack -p 3100
```

Open http://localhost:3100/login. Sign-in always uses a real Mera passkey. Failure switches: `?mock=tx-fail`, `bridge-offline`, `no-agents`, `stress`, `low-balance`. Mock mode shows a "Demo data" badge, and production builds refuse to run in mock mode.

## 6. Web next steps (after the backend lands)

1. **Now:** open the PR stack in order (`feat/web-foundation` → … → `feat/web-audit`) so `@hive/shared` reaches `development` early. The hero video and stills are tracked from `feat/web-landing` onwards. Get the decisions in section 2 answered.
2. **When the contracts are deployed:** runbook Step 10 for `chain` (Kernel + Pimlico, `registerAgent` / `addEdge` / `removeEdge` with explicit gas, receipts linked on Monadscan).
3. **When the bridge serves these routes:** Step 10 for `bridge` (memory decrypt, SSE with resume). Sign-in and agent sessions are already wired in `apps/web/lib/hive/live/bridge.ts`: `/health`, `/v1/auth/challenge`, `/v1/auth/verify`, `/v1/agents`, `/v1/agents/:id/authorize` and `DELETE /v1/agents/:id/session`, each response checked against the shared schema. Tested with a real Mera passkey against a stand-in bridge that uses viem `verifyMessage`; set `NEXT_PUBLIC_BRIDGE_URL` and it should work against the real one.
4. **When Envio is indexing:** Step 10 for `envio` (graph, audit, provenance).
5. Then Step 11 (projector, accessibility, polish) and Step 12 (real demo run, rules T9: new passkey, real Claude Code + GPT, S2–S8 through the canvas, nothing mocked).
