# Architecture

> Status legend: ✅ done · 🚧 in progress · ⏳ planned

## Layers

| # | Layer | Tech | Package | Status |
| --- | --- | --- | --- | --- |
| 1 | Canvas: drag agents, draw permission edges, see propagation | Next.js 15 + React Flow | `apps/web` | ⏳ (Next.js shell ✅) |
| 2 | Passkey auth: Face ID derives the user's keys | Mera (WebAuthn PRF) | `apps/web` | 🚧 |
| 3 | Agent bridge: MCP tools for agents plus an event stream for the canvas | Node + MCP SDK | `apps/bridge` | ⏳ (`/health` ✅) |
| 4 | Memory storage: encrypted memory content | Supabase | `supabase/` (planned) | ⏳ |
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

One passkey produces several keys (this targets the Mera "One Passkey, Many Keys" bounty):

- `m/44'/60'/0'/0/0` is the **owner key**. It owns the Kernel smart account that signs graph changes.
- `HKDF(prf, "hive/encrypt")` is the **encryption key** for memory content.
- `m/44'/60'/0'/0/{n}` is a **per-agent scoped key**, handed to the bridge when the user authorizes agent *n*.

Transactions are sent as ERC-4337 user operations through Pimlico's paymaster, so users need no MON. See [ADR-002](decisions.md).

## Flows (planned)

**Add a permission edge** (checkpoint CP1)
```
Canvas: draw edge ─▶ Face ID (Mera) ─▶ KnowledgeGraph.addEdge (sponsored userOp)
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

## Trust model and honest limits

- The bridge holds the per-agent keys of agents the user has authorized. It is a trusted component in the hackathon version.
- The mock agents are deterministic scripts, which keeps the demo predictable. Real Claude Desktop and ChatGPT integration via MCP is a stretch goal.
