# Hive

**IFTTT for AI agent memory.** Draw lines between your AI agents on a canvas to decide who may share what, and with no line, nothing is shared. Every permission is signed with your passkey (Face ID) and recorded on Monad, so anyone can check it.

> Monad Metropolis Hackathon · Track 4 (Trust, Identity & AI) · submission deadline 13 Oct 2026

> **Status:** early scaffold. Contracts are live on Monad testnet (10143) and the write path (register agents + add an edge) is verified through the `/smoke` harness; the canvas, bridge, and storage layers are still *planned*. See [docs/roadmap.md](docs/roadmap.md) for what's done.

## How it works

```
┌─────────────────────────────────────────────┐
│ 1. Canvas            Next.js + React Flow   │  drag agents, draw permission edges
├─────────────────────────────────────────────┤
│ 2. Passkey auth      Mera (WebAuthn PRF)    │  Face ID is the only key
├─────────────────────────────────────────────┤
│ 3. Agent bridge      Node + MCP SDK         │  lets Claude / ChatGPT / bots talk to Hive
├─────────────────────────────────────────────┤
│ 4. Memory storage    Supabase (encrypted)   │  ciphertext only, server can't read it
├─────────────────────────────────────────────┤
│ 5. Permission graph  Monad + Envio          │  public, auditable edges and events
└─────────────────────────────────────────────┘
```

Memory **content** never goes onchain. Only the permission graph (who may share which topic with whom) is stored on Monad. Details are in [docs/architecture.md](docs/architecture.md).

## Repo layout

| Path | What | Stack |
| --- | --- | --- |
| `apps/web` | Canvas UI | Next.js 15, Tailwind |
| `apps/bridge` | MCP bridge and HTTP API (`:4000/health`) | Node, TypeScript |
| `apps/agents` | Mock chatbots for the demo | Node, TypeScript |
| `packages/contracts` | Agent registry and permission graph | Foundry (Solidity) |
| `packages/shared` | Chain config, ABIs, shared types (`@hive/shared`) | viem |

## Setup

Requires Node 22+, pnpm 11 and [Foundry](https://getfoundry.sh).

```bash
git clone --recurse-submodules <repo-url>   # already cloned? run: git submodule update --init
pnpm install
cp .env.example .env
```

## Run

```bash
pnpm dev     # web on :3000, bridge on :4000
pnpm build   # builds every workspace, including forge build
```

Contracts only: `cd packages/contracts && forge test`

## Docs

- [Architecture](docs/architecture.md): the layers, the data flow, and what goes onchain and what stays offchain
- [Decisions](docs/decisions.md): why Mera only, why a smart account, and so on
- [Roadmap](docs/roadmap.md): phases, checkpoints, P0 features, progress
- [Contributing](docs/contributing.md): branches, commits, PRs
- [Gotchas](docs/gotchas.md): known pitfalls (passkeys, Monad gas, pnpm)
- [AGENTS.md](AGENTS.md): rules for AI coding assistants working in this repo

## Team

| Role | Owns |
| --- | --- |
| P1: Contracts | AgentRegistry, KnowledgeGraph, MemorySlots, tests, deploy |
| P2: Backend / infra | Encrypted storage, MCP bridge, Envio indexer, passkey auth |
| P3: Canvas frontend | React Flow canvas, edge editor, propagation animation |
| P4: Agents & pitch | Mock chatbots, MCP integration, docs, demo script |
