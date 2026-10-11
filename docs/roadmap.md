# Roadmap

Deadline: **13 Oct 2026, 23:59 UTC**. Demo freeze: **10 Oct**.

## Phases

| Phase | Dates | Focus |
| --- | --- | --- |
| 0: Setup | 20–21 Sep | Monorepo scaffold, Mera smoke test, React Flow smoke test |
| 1: Contracts + MCP | 22–28 Sep | Contracts deployed, bridge MCP, first edge via passkey |
| 2: Canvas + propagation | 29 Sep – 5 Oct | Full canvas, end-to-end propagation with animation |
| 3: Polish + rehearse | 6–10 Oct | Bug fixes, demo rehearsals, video recorded 2 days before the deadline |
| 4: Submit buffer | 11–13 Oct | Submission only |

## Checkpoints

| Checkpoint | Date | Done when |
| --- | --- | --- |
| **CP1**: first graph change | 28 Sep | An edge is added via passkey, the Monad tx confirms, the event is visible in Envio, and the explorer link is posted in team chat |
| **CP2**: end-to-end propagation | 5 Oct | Agent A writes memory, a propagation event fires, Agent B receives it, and all of it is visible on the canvas with animation |
| **CP3**: demo freeze | 10 Oct | No new features after this. Only rehearsal and bug fixes |

**Status, 5 Oct:** CP1 and CP2 are not met on `development`. The contracts are deployed and their source is merged (#76). Adding an edge works from `/smoke` with the dev signer, but the canvas still runs on the mock client. The bridge now streams `agent.connected`, `memory.written` and `memory.read` on `/v1/events` and the live client reads that stream (integration and unit tests, not yet run in the browser).

## Verified runs

### 3 Oct 2026 — write layer via dev signer
`/smoke` with `NEXT_PUBLIC_HIVE_DEV_SIGNER` (owner `0x6AC6951B0a53d7a059A121494691A84b5403dF5A`): registered two agents, then added an edge. Three txs confirmed, then checked with `cast call`:

- `agents(1)` → `"Claude"`, `"chatbot"`, owner `0x6AC6…dF5A`
- `agents(2)` → `"ChatGPT"`, `"chatbot"`, owner `0x6AC6…dF5A`
- `hasPermission(1, 2, "demo")` → `true`
- `edge(1)` → `{ from: 1, to: 2, topic: keccak256("demo"), active: true }` · `edgeCount()` → `1`

This exercised the **dev-signer** path only (ADR-006), not a Mera passkey.

### 5 Oct 2026 — MCP write through the bridge
`AgentRegistry.agents(3)` is `"GPT"` and `agents(4)` is `"Claude"`, both owned by `0xB62A…2a6F` with their writer key set (read with `cast call`). From Claude Code, with the `hive` MCP server pointing at the local bridge:

- `hive_whoami` → agent `4`, name `Claude`, `readableTopics: []` (still a stub)
- `hive_read_memory` → `memories: []` (no edge points at agent 4)
- `hive_write_memory` topic `mcp-test` → `slotId` 1, `txHash` `0xc5de9453…ffe4`, `propagatedTo: []` (no edge from agent 4)

Not checked: the transaction on Monadscan, a read by a second agent, or the Connect page reacting to the first call.

### 10 Oct 2026 — two agents, one edge, through the web app and two Claude Code terminals
Fresh passkey account in Chrome on `localhost` (owner `0xc659…5793`, funded from the faucet), `NEXT_PUBLIC_HIVE_MODE=live`, local bridge. Agents `6` `"Testing"` and `7` `"Testing 2"` were created from the canvas sidebar, then an all-topics edge `6 → 7` was signed with the passkey (ADR-013). Each agent ran in its own terminal with the `claude --mcp-config` command from its drawer. Every tool call was a fixed prompt ("call X with exactly these arguments and print the raw JSON"), so the results are reproducible.

| # | Step | Result |
| --- | --- | --- |
| T1 | `hive_whoami` as agent 6 | ✅ `agentId "6"`, `"Testing"`, `readableTopics: []` (still a stub) |
| T2 | `hive_read_memory` as agent 7, nothing written yet | ✅ `memories: []` |
| T3 | agent 6 writes topic `work`, `MARKER-001: standup moved to 10:30` | ⚠️ slot `7`, tx confirmed, but `propagatedTo: []`, expected `["7"]` |
| T4 | agent 7 reads topic `work` | ✅ one memory, `fromAgentId "6"`, `fromName "Testing"`, content equal to what was written |
| T5 | agent 7 writes `MARKER-002`, then agent 6 reads | ✅ slot `8`, `propagatedTo: []`; agent 6 reads `memories: []` (no edge `7 → 6`) |
| T6 | edge revoked on the canvas, then agent 6 writes `MARKER-003` | ✅ edge `active: false` and `hasPermission(6, 7, …)` false, checked with `cast`; slot `9`, `propagatedTo: []` |

The three write transactions were checked on chain with `cast receipt`: `0xf4eb…199b` (slot 7, from agent 6's writer key), `0x02f1…b621` (slot 8, agent 7's writer key), `0xd9b4…74e9` (slot 9, agent 6's writer key). All three have status success.

Found:
- **`propagatedTo` stays empty on an all-topics edge.** The write receipt has only `MemoryWritten`. The deployed `PropagationEngine` compares `edge.topic` with `keccak256(topic)`, and the edge stores `keccak256("*")`. Reads are unaffected because the bridge allows `*`. The contracts' source was changed in #104, but the testnet contracts were not redeployed, so this still holds on testnet. An edge for one topic is expected to emit `Propagate` (not run today). The ADR-021 redeploy (#116) puts the #104 source on testnet; not re-run since.
- **A write failed when the agent key ran out of gas.** The writer key held 0.0318 MON and one write declares about 317k gas × 102 gwei ≈ 0.0323 MON. The key had been topped up only at authorize, and the error said only "Could not write the memory to the chain." Fixed in #115 (top-up before each write, clear message); not yet merged when this was written.

Not checked:
- `hive_read_memory` as agent 7 after the revoke. Only the chain state was checked.
- The `/connect` page. Agents were registered and authorized from the canvas, so "Unlock with passkey" and "Finish setup" on `/connect` were not run.
- Whether the canvas dot of agent 7 turns green when its terminal connects (SSE in a browser), and the propagation animation.
- The edge and register transactions on Monadscan, and ChatGPT.

This is the first run with a real passkey-derived owner: agents and the edge were signed by it, not by the dev signer.

### 11 Oct 2026 — memory search, measured on fixtures and the real model (not a live run)
Two local measurements for ADR-022. Neither touched testnet or Railway.

**Context size.** `apps/bridge/test/context-size.test.ts` seeds 100 memories (4 topics, each decision rewritten five times, one state per topic, about 1.3 KB each) and counts the bytes of the JSON each call returns. A bare `hive_read_memory` (newest 20) returned 27,216 bytes. The new loop (read the topic `state`, list from a cursor, search, read one slot) returned 4,549 bytes, 17%. The bare read also only covers the newest 20, so it can miss the memory the task needs; the new loop reaches it. Bytes stand in for tokens.

**Real model.** `multilingual-e5-small` (quantized, 384 dimensions) loaded in `apps/bridge/test/embedder.e2e.test.ts` (`HIVE_EMBED_E2E=1`, first run about 90 s including the download, then about 1.5 s). On 5 queries over 5 memories in English and Indonesian the right memory ranked first every time. Similarity was 0.799 to 0.875 for the right memory and 0.724 to 0.795 for the others, a thin margin. Through `searchMemory`, "when is the team meeting" found the Indonesian memory "Jadwal rapat tim" by meaning alone, with no shared words, and "which database do we use" matched on text and meaning. The floor default was lowered from 0.8 to 0.78 because 0.8 would have dropped a right match.

Not checked: a live write and search from two agents, the `memory_embedding` table on Supabase (the live test is gated by `HIVE_VECTOR_TABLE=1`), model load time and memory on Railway, and the result on real memories instead of fixtures.

### 11 Oct 2026 — indexer handlers replayed over the real testnet history (no database, no GraphQL)
Envio's test indexer fetched blocks 69814735 to 70000445 of chain 10143 through HyperSync (with `ENVIO_API_TOKEN`) and ran the `packages/indexer` handlers in memory. It processed 22 events in 20 blocks:

- 7 agents for 2 owners, each with its writer key set.
- 4 edges, all all-topics (`*`) and active, none revoked.
- 2 memory slots from agent 4 on topic `general`, each with `propagatedCount` 1.
- 2 propagations `4 → 5`, each joined to its slot and credited to edge 3 (`propagationCount` 2). So `Propagate` does fire on an all-topics edge on the redeployed contracts.
- 15 audit rows, owner and topic counters consistent with the above, and 0 policy violations.

Not checked: a Postgres-backed run (`envio dev`), the GraphQL API the web queries, Envio Cloud, an `EdgeRemoved` on real data (none exists yet), and the `/audit` page against any of it.

## P0 features (required)

| # | Feature | Owner | Status |
| --- | --- | --- | --- |
| P0.1 | AgentRegistry contract | P1 | ✅ deployed to testnet, source and tests in #76 |
| P0.2 | KnowledgeGraph contract (edges) | P1 | ✅ deployed to testnet, source and tests in #76 |
| P0.3 | MemorySlots + PropagationEngine | P1 | ✅ deployed to testnet, source and tests in #76 |
| P0.4 | Passkey auth via Mera | P2 | 🚧 real passkey ceremony and key derivation (ADR-005); `/smoke` can sign with the passkey (#79), but that path is untested |
| P0.5 | Encrypted storage (Supabase) | P2 | ✅ ciphertext-only table, bridge store (#66, #69) |
| P0.6 | MCP bridge server | P2 | 🚧 MCP read/write, authorize, gas top-up, chain reader (#71–#77); SSE `/v1/events` built (`agent.connected`, `memory.written`, `memory.read`, `agent.disconnected`); `GET /v1/memory/:contentHash` (the owner's own ciphertext read) is built; `session.expiring` is planned |
| P0.7 | Visual canvas (React Flow) | P3 | 🚧 canvas, audit and connect screens on the mock client. In live mode the live client reads agents and registers them from `/connect` (unit-tested, not yet run against testnet) and reads the bridge's event stream (unit-tested, not yet run in the browser); edges are read and signed on-chain (not yet run on testnet); audit is still a stub; the agent drawer reads memory text through `GET /v1/memory/:contentHash` and decrypts it on this device (unit-tested, not yet run in a browser, ADR-024) |
| P0.8 | Live propagation animation | P3 | ⏳ |
| P0.9 | 2 mock chatbots | P4 | ⏳ placeholder only |
| P0.10 | Envio indexer (audit trail) | P2 | 🚧 `packages/indexer`: schema, handlers and derived stats (policy check, per-edge counts), tested with simulated events. Not yet synced against testnet, not deployed to Envio Cloud, and the web still reads the mock for audit |
| P0.11 | Demo script + rehearsal | P4 | ⏳ |

P1 nice-to-haves, only after all P0 items are done: Claude Desktop MCP integration, colored isolation zones, provenance view, time-travel replay, ChatGPT integration.

## Build steps

We build one layer at a time. Tick each step off here when it's done.

- [x] Blank monorepo scaffold
- [x] Docs (README, AGENTS.md, docs/)
- [ ] Mera passkey smoke test: `/smoke` page with passkey → address → one onchain tx (gas paid by the Mera EOA, ADR-006)
  - [x] Dev-signer variant verified 3 Oct (see _Verified runs_)
  - [ ] Passkey-signed tx: `/smoke` uses `lib/passkey` (#79) but nobody has run it yet
- [x] Contracts: AgentRegistry, KnowledgeGraph, MemorySlots, PropagationEngine, with tests and a deploy to testnet (#71, #76)
- [x] Canvas: React Flow with 3 nodes and drawable edges (mock client)
- [ ] Live agent registration from `/connect`: `register` + `setAgentWriter`, then bridge `authorize`
  - [x] Code and unit tests with fake chain deps
  - [x] Run against testnet with a passkey-signed owner and a real `claude --mcp-config` terminal, 10 Oct (see _Verified runs_). Done from the canvas sidebar; `/connect` itself was not run
- [ ] Wire edge creation → contract tx (CP1). Works from `/smoke` (dev signer, 3 Oct); the live client now sends `addEdge` / `removeEdge` and reads edges from `KnowledgeGraph` (unit-tested, built but not yet run on testnet), so this stays open until it is
- [ ] Envio indexer (`packages/indexer`)
  - [x] Config for the four contracts from block 69814735, schema, handlers, derived stats and the policy check. Unit-tested with Envio's test indexer and simulated events
  - [x] Handlers replayed over the real testnet history with the test indexer, 11 Oct (see _Verified runs_)
  - [ ] Full local run with Postgres and GraphQL (`envio dev`, needs Docker)
  - [ ] Deploy to Envio Cloud (public GraphQL URL)
  - [ ] Web: `graph.auditEvents` and `graph.provenance` read the indexer
  - [ ] Web: stats strip on `/audit`
- [x] Bridge: MCP tools `write_memory` / `read_memory`, plus SSE `/events`
  - [x] MCP `hive_write_memory` / `hive_read_memory` / `hive_whoami`, live chain reads, `authorize` with gas top-up, encrypted write to `MemorySlots` (#71, #74, #75, #77). A live write from Claude Code returned a receipt on 5 Oct (see _Verified runs_)
  - [x] SSE `/v1/events`: bridge route and web client, tested against a real port and a fake `EventSource`. Not yet seen turning the Connect page green in a browser. `session.expiring` is planned
- [x] Supabase encrypted storage (#66, #69)
- [x] Bridge `hive_save_session`: the agent writes a compact summary of its own session to the shared `brain` topic (ADR-010). Tested with the SDK client, not yet run against testnet, ChatGPT not yet tested
- [ ] Mock agents
- [x] Session restore: the web app keeps the 24h user token across a reload and asks for the passkey again only when keys are needed (ADR-011). Unit-tested for storage and token handling, not yet tried in a browser
- [x] Canvas Reconnect and Disconnect: the agent drawer re-authorizes an agent after a bridge restart (an unexpired token works again) or ends its bridge session. Not yet tried in a browser
- [x] Several named agents per type: Connect lists a type's agents and registers a new one by name (ADR-012). Not yet tried in a browser
- [ ] Structured memory, delta reads and `hive_search_memory` (ADR-022). Built and tested; not yet run against testnet or Railway, so this stays open
  - [x] Shared envelope, schema and crypto helpers
  - [x] Bridge: batch fetch and session cache
  - [x] Bridge: gist, kind, entities, supersede, state, own reads, cursor
  - [x] Bridge: lexical search
  - [x] Bridge: encrypted embeddings (off by default; the `memory_embedding` migration is written but not applied to the shared Supabase project)
  - [x] Shared agent instructions and context-size measurement (a seeded fixture, see _Verified runs_)
  - [ ] Live run: two Claude Code terminals on the deployed bridge, `HIVE_EMBEDDINGS=on`
- [x] Memory history in the agent drawer: past writes read from `MemorySlots.slotsSince` (topic, time and content hash). The text of each memory is fetched as ciphertext from the bridge and decrypted in the browser (summary first, full text on click; locked until the passkey is touched after a reload, ADR-024). Not yet tried in a browser
- [x] Remove an agent from the canvas: hidden in this browser, bridge session ended, refused while it has edges (ADR-012). The registry has no delete. Not yet tried in a browser
- [x] One terminal per agent: `claude --mcp-config` command on Connect and in the drawer, so several agents share one folder. Not yet tried against a real Claude Code
- [x] Create agents from the canvas, keep agent tokens across a reload, and "Finish setup" for a registration that stopped halfway. Not yet run in a browser
- [ ] claude.ai / Claude Desktop connector (OAuth, ADR-019)
  - [x] Bridge: metadata, DCR, authorize redirect, `/v1/oauth/approve`, token and refresh, `WWW-Authenticate` on `/mcp` 401s. Tested with supertest and the SDK client against a real port, not yet run against claude.ai
  - [x] Web consent page `/oauth/authorize` and the claude.ai steps in the Connect popup (unit-tested, not yet run in a browser)
  - [ ] Run against a deployed bridge (`BRIDGE_WEB_URL` set) from claude.ai and Claude Desktop
- [ ] Propagation animation (CP2)
- [ ] Demo script and rehearsal (CP3)

## Open questions (from the PRD)

- Does Mera PRF work under Next.js 15? The smoke test answers this. _Still open 3 Oct — only the dev-signer path has been run._
- Is an ERC-8004 registry deployed on Monad testnet?
- Does the MCP TypeScript SDK support our custom server setup?
- Can React Flow handle 20+ nodes with animation?
- ~~Final product name~~: decided, Mindshare (ADR-008). The rename PR is still to do.
