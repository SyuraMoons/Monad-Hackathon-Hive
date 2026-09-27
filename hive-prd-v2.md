# Hive — PRD/SRD v2.0

**Owner:** Altaf
**Team:** Altaf, Nalen, Akhnaf, Harfi
**Hackathon:** Monad Metropolis — Track 4 (Trust, Identity & AI)
**Deadline:** 13 October 2026, 23:59 UTC
**Target done:** 4 October 2026 (7-day build + 9-day polish buffer)
**Document supersedes:** Hive PRD v1.0 (versi tim)

---

## 1. TL;DR (30 seconds)

Hive is a visual permission graph for AI chatbots. Drag Claude, Cursor, and Therapy Bot onto a canvas, then draw an edge between Claude and Cursor tagged "work" so context flows automatically — but Therapy Bot stays isolated because no line touches it. Every permission is signed with Face ID and recorded on Monad. When Claude learns something, it auto-propagates to Cursor through the edge. No edge means no data flow. The user owns the topology.

**One-liner:** *"LangGraph is a config file. Hive is the dashboard."*

---

## 2. Problem Statement

By 2026, users run many AI chatbots in parallel. Three concrete pain points exist today:

| Pain | Real example | Current workaround |
|---|---|---|
| Re-explanation tax | Told Claude about project "Rayban." Open Cursor — start over. | Copy-paste chat log. 3–5 min lost per switch. |
| Context contamination | Shared memory means the Work Assistant sees therapy notes. | Separate accounts, manual tracking. |
| No user-owned trust | If OpenAI adds cross-app memory, they set the rules. | Trust the vendor's privacy policy. |

**Gap in the market:** No visual, user-owned, cryptographically verifiable control layer for information flow between AI agents.

---

## 3. Solution

A canvas where the user draws a knowledge graph. Nodes are chatbots. Edges are scoped permissions with topic and expiry. Content is encrypted off-chain; the graph is signed and stored on-chain. Propagation runs deterministically: when Agent A writes a memory tagged "work," the engine checks every outgoing edge from A and pushes the memory to Agent B only if that edge covers "work" and has not expired.

**Key insight:** Isolation is a feature, not a bug.

---

## 4. Success Metrics — What "Done" Looks Like

| Metric | Target |
|---|---|
| Demo runs end-to-end without crash | 5 clean rehearsals in a row |
| First graph mutation on Monad testnet | Passkey-signed, visible on HashScan and Envio |
| Propagation latency (write → visible on target agent) | < 3 seconds |
| Live agent integrations | 3 mock agents + Claude Desktop (stretch) |
| Sponsor bounties targeted | 4 (Track 4 + Mera stack + Envio + MetaMask) |
| Feedback document | ≥ 15 concrete DX notes, ≥ 4 sections |

---

## 5. Tech Stack — What Each Piece Does

| Layer | Tool | Function | Primary Owner |
|---|---|---|---|
| Frontend framework | Next.js 15 App Router + React 19 + TypeScript strict | Renders canvas app, hosts API routes | Nalen |
| Canvas library | React Flow | Draggable nodes, drawable edges, zoom/pan | Nalen |
| Styling | Tailwind v4 | Utility CSS | Nalen |
| Client state | Zustand | Canvas state, memory feed, auth state | Nalen |
| Smart contract language | Solidity 0.8.24 | AgentRegistry, KnowledgeGraph, MemorySlots, PropagationEngine | Akhnaf |
| Contract framework | Foundry | Compile, test, deploy | Akhnaf |
| Blockchain | Monad Testnet | Cheap, fast tx for graph edits and events | Akhnaf |
| Contract client | viem + wagmi | Type-safe frontend contract calls | Akhnaf |
| Passkey auth | Mera SDK (P256 / WebAuthn PRF) | Face ID login + PRF-derived encryption keys | Akhnaf (wiring) + Nalen (UI) |
| Encrypted storage | Supabase (Postgres + Storage) | Stores encrypted memory blobs — server cannot decrypt | Harfi |
| Client-side encryption | Web Crypto API (AES-256-GCM) | Encrypts memory before Supabase upload | Altaf |
| Agent bridge protocol | @modelcontextprotocol/sdk | Exposes memory read/write tools to Claude / Cursor / mocks | Altaf |
| Mock agent runtime | Node.js 20 | Simulated chatbots for demo predictability | Harfi |
| Indexer | Envio HyperIndex | Real-time subgraph of contract events | Harfi |
| Frontend deploy | Vercel | Hosts Next.js app | Harfi |
| Bridge deploy | Railway | Hosts MCP bridge on custom domain | Harfi |
| LLM (optional) | Anthropic API | Topic suggestion, edge naming assist | Altaf |
| Repo topology | pnpm monorepo | Single repo, shared packages, easy cross-team sync | Harfi |

---

## 6. Sponsor Targets

| Sponsor | Track / Bounty | Prize | Feature that unlocks it | Confidence |
|---|---|---|---|---|
| **Monad** | Track 4 — Trust, Identity, AI Infra | **$10,000** | Core positioning: user-owned multi-agent trust layer with onchain audit trail | MEDIUM |
| **Mera** | Best Mera-Powered UX | **$2,500** | Face ID / passkey as sole login, PRF-derived encryption keys | HIGH |
| **Mera** | One Passkey, Many Keys | **$2,500** | PRF namespaces: owner-key + encrypt-key + per-agent scope-keys | HIGH |
| **Envio** | Best Use of Envio | **$1,000** | HyperIndex subgraph over agents, edges, memory writes, propagation | HIGH |
| **MetaMask** | Best Agent Wallet Plugin | **$2,500** | MCP bridge exposed as MetaMask agent wallet plugin | MED-HIGH |
| **Monad** | Community Team Project | **$5,000** | Top-3 execution + community vote | MEDIUM |

**Realistic total:** floor $6K · target $16K · stretch $21K
**Deliberately skipped:** Kuru/Perpl (DEX), Nansen (analytics), AGORA (cross-border pay) — no product fit.

---

## 7. Architecture

```
Browser  ────  canvas events  ────▶  Next.js API
    │                                      │
    │ Face ID (Mera passkey)               │ signed tx
    ▼                                      ▼
Passkey signs edge add/remove   ┌──── Monad Testnet ────┐
                                │ AgentRegistry.sol      │
                                │ KnowledgeGraph.sol     │
                                │ MemorySlots.sol        │
                                │ PropagationEngine.sol  │
                                └──────────┬─────────────┘
                                           │ events
                                           ▼
                                ┌──────────────────────┐
                                │ Envio HyperIndex     │──▶ Canvas subscribes
                                └──────────────────────┘

Claude Desktop ─── MCP ───▶  MCP Bridge (Altaf)  ──▶ Supabase (encrypted blobs)
Mock Bot 1     ─── MCP ───▶  MCP Bridge          └─▶ Monad contract calls
Mock Bot 2     ─── MCP ───▶  MCP Bridge

Propagation flow:
1. Agent A writes "Finished Nexus module 3"
2. Bridge encrypts → Supabase → returns contentHash
3. Bridge calls MemorySlots.write(agentA, contentHash, topic="work")
4. PropagationEngine emits Propagate(A→B, contentHash, "work")
5. Envio indexes → canvas animates pulse A→B
6. Agent B reads via MCP → bridge checks edge A→B covers "work" → decrypts → returns
```

**Encryption key delegation model:** The MCP bridge holds a delegated scope-key per agent, derived from the user's passkey PRF at session start. Key lives in memory only, expires after 24 hours, and requires a fresh Face ID sign-in to renew. Chosen for demo speed and clean UX; every scope-key is bound to the agent's on-chain identity, so a stolen bridge session cannot forge writes for a different agent.

---

## 8. Data Model

### Contracts (Solidity)

- **AgentRegistry** — `register(passkeyPubKey, name, agentType) → agentId`; `agents(agentId) → {owner, pubKey, name, type, registeredAt}`
- **KnowledgeGraph** — `addEdge(from, to, topic, expiresAt)` (requires passkey sig from owner of `from`); `removeEdge(edgeId)`; `hasPermission(from, to, topic) → bool`; `edgesFrom(agentId) → Edge[]`
- **MemorySlots** — `write(agentId, contentHash, topic) → slotId` (callable by bridge with delegated scope-key); `slots(slotId) → {agentId, contentHash, topic, writtenAt}`
- **PropagationEngine** — On every `MemoryWritten`, loops through outgoing edges and emits `Propagate(from, to, contentHash, topic, timestamp)` per authorized target

### Off-chain (Supabase)

- `memory_content` — `{contentHash PK, ciphertext BLOB, iv, createdAt}`
- `agent_sessions` — `{agentId, sessionToken, expiresAt}`

---

## 9. Demo Script (3 minutes)

| Time | Screen | Voiceover |
|---|---|---|
| 0:00–0:20 | Empty canvas. Drag Claude, Cursor, Therapy Bot onto it. | "Three AI chatbots. All isolated. No lines yet." |
| 0:20–0:50 | Draw edge Claude → Cursor with topic "work." Face ID prompt. Edge appears. HashScan tab confirms tx. | "One permission. Face ID signs it. Live on Monad." |
| 0:50–1:30 | In Claude mock, send: "Working on project Nexus, deadline Oct 13." Canvas: light pulse Claude → Cursor. | "Claude learns. Propagation runs through the edge I drew." |
| 1:30–2:00 | In Cursor mock (fresh session), ask: "What am I working on?" → "Nexus, deadline Oct 13." | "Zero re-explanation. Automatic because the edge exists." |
| **2:00–2:30 ★** | In Therapy Bot mock, ask same question → "I don't have context on that." | "Therapy Bot knows nothing — no edge, no flow. Isolation preserved." |
| 2:30–3:00 | Delete Claude → Cursor edge (Face ID). Open Envio dashboard: full audit trail visible. Closing line. | "You own the topology. Revoke anytime. Auditable without trusting us." |

**WOW moment:** Beat 5 — Therapy Bot returns empty. Isolation *proven* live, not claimed.

---

## 10. Task Breakdown — Atomic, Grouped Per Person

### Altaf — Agentic / AI Integration

| # | Task | Description | Priority | Est. |
|---|---|---|---|---|
| AL-1 | MCP tool schema | Define 3 MCP tools: `hive_write_memory(agentId, content, topic)`, `hive_read_memory(agentId, sinceTimestamp)`, `hive_register_agent(name, type)`. Document in `packages/mcp-schema/`. | P0 | 3h |
| AL-2 | MCP bridge server scaffold | Node.js 20 + Express + `@modelcontextprotocol/sdk`. Port 8090, `/mcp` endpoint, structured logging. Deploy to Railway with custom domain. | P0 | 4h |
| AL-3 | Agent identity binding | On `hive_register_agent`: generate scoped keypair, call `AgentRegistry.register()`, return `{agentId, sessionToken}`. Persist session in in-memory Map. | P0 | 4h |
| AL-4 | Client-side encryption module | AES-256-GCM with key derived from user passkey PRF. Utilities: `encrypt`, `decrypt`, `contentHash`. Shared via `packages/crypto`. | P0 | 3h |
| AL-5 | Write memory flow | On `hive_write_memory`: encrypt → upload ciphertext to Supabase → receive `contentHash` → call `MemorySlots.write()`. Return `slotId`. | P0 | 4h |
| AL-6 | Permission-checked read flow | On `hive_read_memory(agentId, since)`: query incoming edges → fetch slots since timestamp → filter by edge topic → fetch ciphertext → decrypt → return array. | P0 | 6h |
| AL-7 | Propagation event consumer | Listen to `PropagationEngine.Propagate` via Envio websocket. Push notification via SSE to target agent's active MCP session. | P0 | 5h |
| AL-8 | MCP session JWT | HS256 signed JWT, 24h TTL, claims `{agentId, scope, expiresAt}`. Verify on every MCP call. | P0 | 2h |
| AL-9 | Claude Desktop integration | Configure Claude Desktop MCP config → bridge. Test all 3 tools live. Screenshot for feedback doc. | P1 | 3h |
| AL-10 | MCP client library for mocks | Ship `packages/mcp-client` — used by Harfi's mock bots. Ensures demo works without Claude Desktop. | P0 | 3h |
| AL-11 | Bridge health endpoint | `GET /health` → `{supabaseReachable, contractsReachable, activeSessions, envioReachable}`. | P0 | 1h |
| AL-12 | Permission-check unit tests | Test matrix: expired edge → deny; missing edge → deny; wrong topic → deny; valid edge → allow. **This is where a bug leaks data — must be tested.** | P0 | 3h |

**Total: ~41h**

### Akhnaf — Smart Contracts + Frontend Integration

| # | Task | Description | Priority | Est. |
|---|---|---|---|---|
| AK-1 | Foundry setup | Init Foundry, configure Monad testnet RPC in `foundry.toml`, add OZ remappings. | P0 | 1h |
| AK-2 | `AgentRegistry.sol` | `register(passkeyPubKey, name, agentType)`. Store agents mapping. Emit `AgentRegistered`. Owner = msg.sender. | P0 | 3h |
| AK-3 | `KnowledgeGraph.sol` | `addEdge(from, to, topic, expiresAt)` — verifies msg.sender owns `from`. `removeEdge(edgeId)`. `hasPermission()` view. Emit `EdgeAdded`, `EdgeRemoved`. | P0 | 5h |
| AK-4 | `MemorySlots.sol` | `write(agentId, contentHash, topic)` — verifies caller registered scope-key for agentId. Emit `MemoryWritten`. | P0 | 3h |
| AK-5 | `PropagationEngine.sol` | On every `MemoryWritten`, loops through KnowledgeGraph outgoing edges, emits `Propagate(from, to, contentHash, topic)` per authorized target. | P0 | 4h |
| AK-6 | Contract test suite (Foundry) | Cover: register, addEdge, propagation triggers, expired edge does not propagate, non-owner cannot addEdge. Target ≥ 90% coverage. | P0 | 5h |
| AK-7 | Deploy to Monad testnet | Run deploy script, save addresses to `deployments/monad-testnet.json`, verify on explorer, commit. | P0 | 2h |
| AK-8 | Frontend contract hooks (wagmi/viem) | `useAgentRegistry`, `useKnowledgeGraph`, `useMemorySlots`. Types generated from ABI. | P0 | 4h |
| AK-9 | Mera passkey → contract wiring | Wire Mera passkey sig into wagmi `walletClient`. Test `addEdge` with Face ID end-to-end. | P0 | 5h |
| AK-10 | Transaction status hook | `useTxStatus(hash) → {pending, confirmed, failed, hashscanUrl}`. Consumed by Nalen's toasts. | P0 | 2h |
| AK-11 | Gas estimation helper | Wrap contract writes with gas estimate + Monad-specific multiplier. | P1 | 2h |
| AK-12 | Contracts README | `contracts/README.md` — deploy steps, addresses, ABI locations, verification. | P0 | 1h |

**Total: ~37h**

### Nalen — Frontend & Client Interface

| # | Task | Description | Priority | Est. |
|---|---|---|---|---|
| NL-1 | Next.js 15 app scaffold | App Router, TS strict, Tailwind v4, Zustand. Dark theme. Fixed 1440×900 demo viewport. | P0 | 2h |
| NL-2 | Landing / login page | Face ID login via Mera passkey. On success, redirect to canvas. Show "Not verified" state if no passkey. | P0 | 3h |
| NL-3 | Canvas shell | Three regions: left sidebar (agent chips), center (React Flow canvas), right (live memory feed). | P0 | 4h |
| NL-4 | Agent chip drag-drop | Drag Claude / Cursor / Therapy Bot from sidebar → drop → creates node → calls `hive_register_agent`. | P0 | 4h |
| NL-5 | Node component | Rounded card, icon, name, truncated agentId, status dot (green=active, gray=idle, red=revoked). Click opens detail drawer. | P0 | 3h |
| NL-6 | Edge editor | Click between two nodes → modal with topic input + expiry picker (24h / 7d / 30d / custom). Confirm → Face ID → contract call → edge draws. | P0 | 5h |
| NL-7 | Propagation animation | Subscribe to Envio websocket for `Propagate`. On event: light pulse travels source → target along edge (600ms ease-out). Color per topic. | P0 | 5h |
| NL-8 | Live memory feed panel | Right panel lists recent memory writes as they happen (SSE from bridge). Row: agent name, topic, first 60 chars decrypted, timestamp. | P0 | 4h |
| NL-9 | Edge delete flow | Right-click edge → "Revoke" → Face ID → contract call → edge fades. | P0 | 2h |
| NL-10 | HashScan link chips | Every edge and memory row shows a "View on HashScan" link. | P0 | 1h |
| NL-11 | Isolation zone highlight | Toggle: highlights groups with no cross-edges (visual proof of isolation). Translucent colored overlay. | P1 | 3h |
| NL-12 | Toast notifications | Success / pending / error. Uses Akhnaf's `useTxStatus`. | P0 | 2h |
| NL-13 | Empty states + onboarding | "Drag your first agent here." / "No memory yet." | P0 | 2h |
| NL-14 | Projector polish pass | Test on external display. Fonts ≥ 14px. High contrast. Reduce motion where distracting. | P0 | 3h |

**Total: ~43h**

### Harfi — Web3 Infra + Demo + Deliverables

| # | Task | Description | Priority | Est. |
|---|---|---|---|---|
| HF-1 | Monorepo scaffold | pnpm workspace. Apps: `web`, `bridge`, `mock-agents`. Packages: `contracts`, `mcp-schema`, `crypto`, `mcp-client`. | P0 | 2h |
| HF-2 | Supabase project setup | Create project, migrate `memory_content` + `agent_sessions` tables, set RLS (server role only), inject service key. | P0 | 2h |
| HF-3 | Encrypted storage API | Thin wrapper: `putCiphertext(hash, ciphertext, iv)`, `getCiphertext(hash)`. Supabase Edge Function or Next.js route. | P0 | 3h |
| HF-4 | Envio subgraph — indexer config | Index all 4 contracts, events: `AgentRegistered`, `EdgeAdded`, `EdgeRemoved`, `MemoryWritten`, `Propagate`. | P0 | 4h |
| HF-5 | Envio schema + resolvers | GraphQL schema: `Agent`, `Edge`, `MemorySlot`, `PropagationEvent`. Resolvers with pagination + agentId filters. | P0 | 4h |
| HF-6 | Envio deploy | Push indexer to Envio Cloud. Public GraphQL endpoint. Commit URL to README. | P0 | 2h |
| HF-7 | Envio subscription hook | Wrap Envio websocket in Zustand-integrated hook for the frontend. Auto-reconnect on drop. | P0 | 3h |
| HF-8 | Mock agent 1 — "Claude" | Node.js script speaking MCP client protocol to Altaf's bridge via `packages/mcp-client`. Actions: register, write, read. CLI: `pnpm mock:claude "message"`. | P0 | 4h |
| HF-9 | Mock agent 2 — "Cursor" | Same as HF-8, different identity + name. | P0 | 2h |
| HF-10 | Mock agent 3 — "Therapy Bot" | Same shape. Isolated by default (never draw edge to it in demo). | P0 | 1h |
| HF-11 | Feedback document (running notes) | Create `docs/feedback.md` day 1. Update at end of every dev session: Monad DX, Mera SDK friction, Envio quirks, MCP pain, deploy issues. Target ≥ 15 concrete points. | P0 | 30min/day × 14 days |
| HF-12 | README | Overview, setup, architecture diagram, sponsor tracks, HashScan links, demo instructions. | P0 | 3h |
| HF-13 | Architecture diagram | Draw the diagram from section 7 in Excalidraw or Figma. Export PNG. Embed in README. | P0 | 2h |
| HF-14 | Demo video (≤ 3 min) | Record demo the moment it works end-to-end. English voiceover. Upload YouTube unlisted. Link in README. | P0 | 3h |
| HF-15 | Pitch script | Three beats: agents proliferate → context contamination is here → Hive is the visual control layer. Practice out loud with team. | P0 | 3h |
| HF-16 | Fallback video | Full happy-path demo backup. Verify plays offline. | P0 | 1h |
| HF-17 | Deployment automation | Vercel for web, Railway for bridge. Keep-alive pings so cold start does not kill demo. | P0 | 2h |
| HF-18 | Env / secrets doc | Document every env var across web, bridge, mocks. Template `.env.example`. | P0 | 1h |
| HF-19 | Sponsor bounty checklist | Track requirements per bounty. Verify each with screenshots + links before submission. | P0 | 2h |

**Total: ~51h + 7h feedback doc across days**

---

## 11. Timeline — 27 Sept to 13 Oct

| Phase | Dates | Focus | Milestone |
|---|---|---|---|
| **Phase 0 — Setup** | 27–28 Sept (2 days) | Monorepo, Supabase, Foundry, Mera smoke test, contract skeletons | Kickoff call, role lock-in |
| **Phase 1 — Contracts + Bridge core** | 29 Sept – 1 Oct (3 days) | Akhnaf ships contracts. Altaf ships bridge (register + write). Nalen ships canvas skeleton. Harfi ships Envio indexer. | **★ CP1 (1 Oct EOD):** first passkey-signed edge on Monad, visible in Envio |
| **Phase 2 — End-to-end integration** | 2–4 Oct (3 days) | Full propagation flow: mock A writes → Envio → canvas animates → mock B reads. Four streams merge. | **★ CP2 (4 Oct EOD):** full demo path works, ugly but real |
| **Phase 3 — Polish + demo prep** | 5–10 Oct (6 days) | Nalen polishes UI. Harfi records video + writes feedback doc. Altaf attempts Claude Desktop. Akhnaf hardens contracts. | **★ CP3 (10 Oct):** DEMO FREEZE. Bug fixes only. |
| **Phase 4 — Submission buffer** | 11–13 Oct (3 days) | Rehearse 5×. Submit. | Submit by 13 Oct 23:59 UTC |

---

## 12. Integration Checkpoints — Non-negotiable

| Checkpoint | Date | Success criteria | If it slips |
|---|---|---|---|
| **CP1 — First mutation** | 1 Oct EOD | Passkey signs edge → tx confirms on Monad → Envio indexes → HashScan link works | All 4 escalate onto CP1. Nothing else matters. |
| **CP2 — End-to-end** | 4 Oct EOD | Mock A writes → propagation → mock B reads → visible on canvas + Envio | Cut Claude Desktop (P1). Use only mocks. |
| **CP3 — Demo freeze** | 10 Oct EOD | 3-min demo runs cleanly 3× in a row | Only demo-breaking bugs get fixed. No new features. |

---

## 13. Risk Register

| Risk | Severity | Early signal | Mitigation |
|---|---|---|---|
| Mera PRF fails in Next.js 15 | HIGH | Phase 0 smoke test fails | Fallback: Privy passkey. Lose $5K Mera bounty, product still ships. |
| Monad testnet unstable | HIGH | RPC 5xx or slow finality in rehearsal | Read layer served by Envio cache. Never block UI on live RPC. |
| React Flow performance drops with animations | MED | Frame drops on demo laptop | Downgrade to CSS-only edge draw. Kill isolation-zone overlay. |
| MCP integration with Claude Desktop breaks | MED | Config load fails | Demo uses 3 mock agents. Claude Desktop is P1, not P0. |
| Envio subgraph lags | MED | Events appear seconds late | Render optimistically from tx receipt, reconcile with Envio. |
| Judges say "just LangGraph on-chain" | HIGH | Q&A pushback | Rehearse 20-sec differentiator: visual + user-owned + isolation-first + onchain audit. |
| Feedback doc thin | HIGH | Empty on day 3 | Harfi commits to daily notes (HF-11). Not optional. |
| Team member sick / offline | MED | Missed daily sync | Every P0 task has notes committed to repo. No shared brain in one head. |

---

## 14. Open Questions — Answer by 28 Sept EOD

| Question | Owner | Blocking? |
|---|---|---|
| Does Mera PRF extension work in Next.js 15 App Router? | Akhnaf | YES — decides auth stack |
| Is `@modelcontextprotocol/sdk` stable for a custom server on Node 20? | Altaf | YES — decides bridge feasibility |
| Does Envio HyperIndex support Monad testnet? | Harfi | YES — decides indexer choice |
| Does React Flow handle 20 nodes + concurrent edge animations at 60fps? | Nalen | YES — decides canvas approach |
| Public name: keep "Hive"? Trademark check needed? | Altaf | LOW — codename fine until submission |

---

## 15. Communication Cadence

- **Daily standup:** 21:00 WIB, 15 min max, Discord voice
- **Weekly checkpoint review:** Sunday 20:00 WIB
- **Repo:** all P0 tasks tracked as GitHub issues, assigned to owner
- **Emergency ping:** WhatsApp group for blockers only

---

*End of PRD v2.0 — supersedes v1.0. Source of truth for the 4-person build from 27 Sept to 13 Oct 2026.*
