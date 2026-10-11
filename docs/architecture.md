# Architecture

> Status legend: ✅ done · 🚧 in progress · ⏳ planned

## Layers

| # | Layer | Tech | Package | Status |
| --- | --- | --- | --- | --- |
| 1 | Canvas: drag agents, draw permission edges, see propagation | Next.js 15 + React Flow | `apps/web` | ⏳ (Next.js shell ✅) |
| 2 | Passkey auth: the passkey derives the user's keys | Mera (WebAuthn PRF) | `apps/web` | 🚧 (dev-signer path ✅, PRF ⏳) |
| 3 | Agent bridge: MCP tools for agents plus an event stream for the canvas | Node + MCP SDK | `apps/bridge` | ⏳ (`/health` ✅) |
| 4 | Memory storage: encrypted memory content | Supabase | `supabase/` | ⏳ (`memory_content` table and bridge store `apps/bridge/src/store.ts` ✅; written by the write flow, AL-5, planned) |
| 5 | Permission graph: agents, edges, propagation events | Solidity on Monad testnet (10143) | `packages/contracts` | ✅ |
| 5b | Audit trail: indexed onchain events | Envio HyperIndex | `packages/indexer` (planned) | ⏳ |

## What goes where

| Data | Where | Why |
| --- | --- | --- |
| Agent identities | Monad (`AgentRegistry`) | Public, verifiable identity |
| Permission edges (from, to, topic, expiry) | Monad (`KnowledgeGraph`) | Anyone can audit who may share what |
| Memory write events (content **hash** only) | Monad (`MemorySlots`) | Verifiable propagation trail |
| Memory content | Supabase, AES-GCM ciphertext | Private. The server can't decrypt it |
| Keys | Derived on the client from the passkey PRF output | Never stored server-side |

## Keys (planned)

One passkey produces several keys (this targets the Mera "One Passkey, Many Keys" bounty). The passkey's PRF output (Mera's default salt, 32 bytes) is the entropy of a 24-word BIP-39 **recovery phrase**, and every key comes from that phrase's seed ([ADR-005](decisions.md)):

- `m/44'/60'/0'/0/0` is the **owner key**. It owns the Kernel smart account that signs graph changes.
- `HKDF(seed, "hive/encrypt")` is the **encryption key** for memory content.
- `m/44'/60'/0'/0/{n}` is a **per-agent scoped key**, handed to the bridge when the user authorizes agent *n*.

The same phrase restores the same account without the passkey, in Hive or any BIP-39 wallet. The wallet menu shows it after a fresh passkey prompt. Keys are derived and signing works today; the owner key signs writes directly (AK-9, ADR-006), but so far only from the `/smoke` page and, in live mode, the Connect screen's agent registration (not yet run on testnet). The canvas is not wired to edge transactions yet.

Transactions were planned as ERC-4337 user operations through Pimlico's paymaster, so users need no MON. See [ADR-002](decisions.md). Superseded by [ADR-006](decisions.md) — writes go from a faucet-funded EOA; Kernel + Pimlico return behind `HiveSigner`.

## Flows (planned)

**Add a permission edge** (checkpoint CP1)
```
Canvas: draw edge ─▶ passkey (Mera) ─▶ KnowledgeGraph.addEdge (direct tx, ADR-006)
       ─▶ EdgeAdded event ─▶ Envio indexes it ─▶ canvas and audit trail update
```

**Memory propagation** (checkpoint CP2)
```
Agent A ─▶ bridge write_memory(topic, text)
        ─▶ encrypt ─▶ Supabase (ciphertext)
        ─▶ MemorySlots.write(topic, hash) ─▶ Propagate to every allowed edge
        ─▶ bridge SSE /events ─▶ canvas pulse animation
Agent B ─▶ bridge read_memory(topic) ─▶ onchain canRead check ─▶ decrypt ─▶ context
Agent C (no edge) ─▶ read_memory ─▶ nothing returned   ← the demo's WOW moment
```

**Connect claude.ai or Claude Desktop** (ADR-019; built, not yet run against claude.ai)
```
claude.ai ─▶ POST /mcp ─▶ 401 + WWW-Authenticate (resource_metadata)
          ─▶ /.well-known/* ─▶ POST /oauth/register (DCR) ─▶ GET /oauth/authorize + PKCE
          ─▶ web /oauth/authorize: passkey, pick an agent ─▶ /v1/agents/:id/authorize + /v1/oauth/approve
          ─▶ redirect to claude.ai with a 60 s code ─▶ POST /oauth/token ─▶ agent token (refreshable while the session lives)
```

**Find memory without loading it all** (built, ADR-022; not yet run on testnet or Railway)
```
Agent ─▶ read_memory(kind=state) ─▶ list_memory(cursor) ─▶ search_memory(query)
      ─▶ permission filter on live chain state ─▶ rank in the bridge (BM25, then encrypted embeddings)
      ─▶ previews and gists ─▶ read_memory(slotIds) for the 0–2 that matter
```

## Trust model and honest limits

- The bridge holds the per-agent keys of agents the user has authorized. It is a trusted component in the hackathon version.
- While an agent's session lives, the bridge also keeps that agent's decrypted memories (and, with embeddings on, their vectors) in process memory so a repeat read costs no fetch, up to 2000 per session. They are never written to disk. They are dropped when the session ends (sign-out, disconnect, expiry or authorizing the agent again), and background embedding stops with it. Permission is still read from the chain on every call.
- The owner reads their own memories in the canvas: the bridge returns the ciphertext of memories they own and the browser decrypts it with the key derived from their passkey. Decrypted text stays in browser memory and is dropped on sign-out (ADR-024).
- Topic names and agent names are public. `MemorySlots` stores each memory's topic as text and `AgentRegistry` stores agent names and types, so anyone can read them on a block explorer, forever. Only memory content is encrypted (ADR-023).
- An authorized read hands plaintext to the reading agent, and so to its model provider (Anthropic, OpenAI or DeepSeek), which may keep it under its own terms. Encryption protects memory at rest and between agents without an edge, not from the model that reads it.
- Claude Code connects over MCP and was run against testnet on 10 Oct. The claude.ai and Claude Desktop connector (ADR-019) is built but not yet run against claude.ai, the DeepSeek runner is planned until a live run (ADR-020), and ChatGPT is not yet tested. The web app's mock mode uses fixed demo data.
