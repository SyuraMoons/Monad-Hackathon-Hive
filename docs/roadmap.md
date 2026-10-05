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

**Status, 5 Oct:** CP1 and CP2 are not met on `development`. The contracts are deployed and their source is merged (#76). Adding an edge works from `/smoke` with the dev signer, but the canvas still runs on the mock client.

## Verified runs

### 3 Oct 2026 — write layer via dev signer
`/smoke` with `NEXT_PUBLIC_HIVE_DEV_SIGNER` (owner `0x6AC6951B0a53d7a059A121494691A84b5403dF5A`): registered two agents, then added an edge. Three txs confirmed, then checked with `cast call`:

- `agents(1)` → `"Claude"`, `"chatbot"`, owner `0x6AC6…dF5A`
- `agents(2)` → `"ChatGPT"`, `"chatbot"`, owner `0x6AC6…dF5A`
- `hasPermission(1, 2, "demo")` → `true`
- `edge(1)` → `{ from: 1, to: 2, topic: keccak256("demo"), active: true }` · `edgeCount()` → `1`

This exercised the **dev-signer** path only (ADR-006), not a Mera passkey.

## P0 features (required)

| # | Feature | Owner | Status |
| --- | --- | --- | --- |
| P0.1 | AgentRegistry contract | P1 | ✅ deployed to testnet, source and tests in #76 |
| P0.2 | KnowledgeGraph contract (edges) | P1 | ✅ deployed to testnet, source and tests in #76 |
| P0.3 | MemorySlots + PropagationEngine | P1 | ✅ deployed to testnet, source and tests in #76 |
| P0.4 | Passkey auth via Mera | P2 | 🚧 real passkey ceremony and key derivation (ADR-005); `/smoke` can sign with the passkey (#79), but that path is untested |
| P0.5 | Encrypted storage (Supabase) | P2 | ✅ ciphertext-only table, bridge store (#66, #69) |
| P0.6 | MCP bridge server | P2 | 🚧 MCP read/write, authorize, gas top-up, chain reader (#71–#77); SSE `/events` not built |
| P0.7 | Visual canvas (React Flow) | P3 | 🚧 canvas, audit and connect screens on the mock client. In live mode the live client reads agents and registers them from `/connect` (unit-tested, not yet run against testnet); edges, audit and memory preview are still stubs |
| P0.8 | Live propagation animation | P3 | ⏳ |
| P0.9 | 2 mock chatbots | P4 | ⏳ placeholder only |
| P0.10 | Envio indexer (audit trail) | P2 | ⏳ |
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
  - [ ] Run against testnet with a passkey-signed owner (needs MON on the owner address) and a real `claude mcp add`
- [ ] Wire edge creation → contract tx (CP1). Works from `/smoke` (dev signer, 3 Oct); the live client's `addEdge` is still a stub, so the canvas does not send it
- [ ] Envio indexer
- [ ] Bridge: MCP tools `write_memory` / `read_memory`, plus SSE `/events`
  - [x] MCP `hive_write_memory` / `hive_read_memory` / `hive_whoami`, live chain reads, `authorize` with gas top-up, encrypted write to `MemorySlots` (#71, #74, #75, #77). No live write yet: no agent is registered on testnet
  - [ ] SSE `/events`
- [x] Supabase encrypted storage (#66, #69)
- [ ] Mock agents
- [ ] Propagation animation (CP2)
- [ ] Demo script and rehearsal (CP3)

## Open questions (from the PRD)

- Does Mera PRF work under Next.js 15? The smoke test answers this. _Still open 3 Oct — only the dev-signer path has been run._
- Is an ERC-8004 registry deployed on Monad testnet?
- Does the MCP TypeScript SDK support our custom server setup?
- Can React Flow handle 20+ nodes with animation?
- ~~Final product name~~: decided, Mindshare (ADR-008). The rename PR is still to do.
