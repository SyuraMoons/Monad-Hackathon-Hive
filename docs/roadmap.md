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

**Status, 5 Oct:** CP1 and CP2 are not met on `development`. The contracts are deployed, but their source and the web write path are in open PR #76, and the canvas still runs on the mock client.

## P0 features (required)

| # | Feature | Owner | Status |
| --- | --- | --- | --- |
| P0.1 | AgentRegistry contract | P1 | 🚧 deployed to testnet, source in open PR #76 |
| P0.2 | KnowledgeGraph contract (edges) | P1 | 🚧 deployed to testnet, source in open PR #76 |
| P0.3 | MemorySlots + propagation | P1 | 🚧 deployed to testnet, source in open PR #76 |
| P0.4 | Passkey auth via Mera | P2 | 🚧 real passkey ceremony and key derivation (ADR-005); no passkey-signed tx yet |
| P0.5 | Encrypted storage (Supabase) | P2 | ✅ ciphertext-only table, bridge store (#66, #69) |
| P0.6 | MCP bridge server | P2 | 🚧 MCP read/write, authorize, gas top-up, chain reader (#71–#77); SSE `/events` not built |
| P0.7 | Visual canvas (React Flow) | P3 | 🚧 canvas, audit and connect screens on the mock client; live client not wired |
| P0.8 | Live propagation animation | P3 | ⏳ |
| P0.9 | 2 mock chatbots | P4 | ⏳ placeholder only |
| P0.10 | Envio indexer (audit trail) | P2 | ⏳ |
| P0.11 | Demo script + rehearsal | P4 | ⏳ |

P1 nice-to-haves, only after all P0 items are done: Claude Desktop MCP integration, colored isolation zones, provenance view, time-travel replay, ChatGPT integration.

## Build steps

We build one layer at a time. Tick each step off here when it's done.

- [x] Blank monorepo scaffold
- [x] Docs (README, AGENTS.md, docs/)
- [ ] Mera passkey smoke test: passkey → address → one onchain tx (gas paid by the Mera EOA, ADR-006). Passkey and address work; the tx is not wired yet
- [ ] Contracts: AgentRegistry, KnowledgeGraph, MemorySlots, with tests and a deploy to testnet. Deployed, ABIs and addresses in `@hive/shared` (#71); source and tests in open PR #76
- [x] Canvas: React Flow with 3 nodes and drawable edges (mock client)
- [ ] Wire edge creation → contract tx (CP1). Live `addEdge` is a stub until #76 lands
- [ ] Envio indexer
- [ ] Bridge: MCP tools `write_memory` / `read_memory`, plus SSE `/events`
  - [x] MCP `hive_write_memory` / `hive_read_memory` / `hive_whoami`, live chain reads, `authorize` with gas top-up, encrypted write to `MemorySlots` (#71, #74, #75, #77). No live write yet: no agent is registered on testnet
  - [ ] SSE `/events`
- [x] Supabase encrypted storage (#66, #69)
- [ ] Mock agents
- [ ] Propagation animation (CP2)
- [ ] Demo script and rehearsal (CP3)

## Open questions (from the PRD)

- Does Mera PRF work under Next.js 15? The smoke test answers this.
- Is an ERC-8004 registry deployed on Monad testnet?
- Does the MCP TypeScript SDK support our custom server setup?
- Can React Flow handle 20+ nodes with animation?
- ~~Final product name~~: decided, Mindshare (ADR-008). The rename PR is still to do.
