# Mindshare

**An onchain permission layer for AI agent memory.** An agent can read another agent's memory only if the owner signed a permission edge for it on Monad. With no edge, nothing is shared. Memory content is encrypted with a key derived from the owner's passkey and is never put onchain.

It is built for developers to build on: four contracts, an MCP server any agent can call, a typed client, and an indexer that audits the whole history. The canvas in `apps/web` is the reference client, where the owner draws the edges.

> Monad Metropolis Hackathon · Track 4 (Trust, Identity & AI) · also entered for the Envio and Mera bounties.
> The product is Mindshare. The code still says Hive (`@hive/*`, `hive_*`) until one rename ([ADR-008](docs/decisions.md)).

## Live

| | |
| --- | --- |
| **App** (reference client) | https://monad-hackathon-eta.vercel.app |
| **Bridge** (MCP server and HTTP API) | https://hivebridge-production.up.railway.app · [`/health`](https://hivebridge-production.up.railway.app/health) · [`/docs`](https://hivebridge-production.up.railway.app/docs) (Swagger) · [`/openapi.json`](https://hivebridge-production.up.railway.app/openapi.json) |
| **Agent card** (ERC-8004) | [`/agents/1/card.json`](https://hivebridge-production.up.railway.app/agents/1/card.json) |
| **Indexer** (Envio GraphQL) | Not deployed to Envio Cloud yet. It runs locally, see [packages/indexer](packages/indexer) |
| **Demo video** | To be added |
| **Pitch video** | To be added |

Contracts on Monad testnet (chain 10143):

| Contract | Address |
| --- | --- |
| `AgentRegistry` | [`0x06F4401cF289bfc29de59Fc1B624096Dc69ff25B`](https://testnet.monadscan.com/address/0x06F4401cF289bfc29de59Fc1B624096Dc69ff25B) |
| `KnowledgeGraph` | [`0x80db4a46BEE029464Aa1fca083985d1C5178AFd6`](https://testnet.monadscan.com/address/0x80db4a46BEE029464Aa1fca083985d1C5178AFd6) |
| `MemorySlots` | [`0xdE8DAf9599366b2ef8Ae245bF574808844Aa5f8a`](https://testnet.monadscan.com/address/0xdE8DAf9599366b2ef8Ae245bF574808844Aa5f8a) |
| `PropagationEngine` | [`0x4af2CC25026f918E88d727704D3FB888C20b0397`](https://testnet.monadscan.com/address/0x4af2CC25026f918E88d727704D3FB888C20b0397) |
| ERC-8004 Identity Registry (not ours) | [`0x8004A818BFB912233c491871b3d84c89A494BD9e`](https://testnet.monadscan.com/address/0x8004A818BFB912233c491871b3d84c89A494BD9e) |

## Try it (for judges)

There is no test account: the login is a passkey you create yourself, and it is the only key.

1. Open the [app](https://monad-hackathon-eta.vercel.app) in Safari with iCloud Keychain, or in Chrome with Google Password Manager, or with 1Password. A passkey saved locally in desktop Chrome cannot produce the key material and fails ([gotchas](docs/gotchas.md)).
2. Create a passkey. The wallet menu shows your address.
3. Send testnet MON to that address from https://faucet.monad.xyz. Your address pays its own gas ([ADR-006](docs/decisions.md)).
4. Create two agents from the canvas sidebar, then drag from one to the other and sign the edge with the passkey.
5. Open an agent's drawer and copy its `claude --mcp-config` command into a terminal with Claude Code. Do the same for the second agent in a second terminal.
6. Ask the first agent to save something to Hive, then ask the second to read it. Revoke the edge on the canvas and the next read returns nothing.

These steps were run on 10 Oct against testnet with a local web app and a local bridge ([roadmap, verified runs](docs/roadmap.md)). They have not yet been run end to end on the deployed site.

## How it works

```
 Owner (passkey)                                Agents (Claude, ChatGPT, your own)
       │                                                    │ MCP over HTTP, agent token
       ▼                                                    ▼
┌──────────────────┐   authorize an agent    ┌──────────────────────────────────────┐
│ Reference client │────────────────────────▶│ Bridge                               │
│ apps/web         │   (keys for a session)  │ apps/bridge                          │
│ canvas, audit    │                         │ 1. check the edge on live chain state│
└──────┬───────────┘                         │ 2. only then fetch, decrypt, rank    │
       │ signs with the owner key            └───────┬──────────────────┬───────────┘
       ▼                                             │ hash, topic      │ ciphertext
┌────────────────────────────────────────────────────▼───┐      ┌───────▼──────────┐
│ Monad testnet                                          │      │ Supabase         │
│ AgentRegistry · KnowledgeGraph · MemorySlots ·         │      │ AES-256-GCM      │
│ PropagationEngine · ERC-8004 Identity Registry         │      │ ciphertext only  │
└───────────────────────────┬────────────────────────────┘      └──────────────────┘
                            │ events
                            ▼
                  ┌───────────────────┐
                  │ Envio HyperIndex  │──▶ audit page, provenance, stats, policy check
                  │ packages/indexer  │
                  └───────────────────┘
```

**Write.** An agent calls `hive_write_memory`. The bridge encrypts the content, stores the ciphertext, and the agent's own key sends `MemorySlots.write(topic, contentHash)`. The contract emits a `Propagate` event for every edge that allows it.

**Read.** An agent calls `hive_read_memory`. The bridge reads the permission graph from live chain state first. Only for senders with an active, unexpired edge to the reader does it fetch and decrypt anything. An agent with no edge gets an empty list.

**Revoke.** The owner removes the edge on the canvas. The next read checks the chain again, so the revoke is immediate. The indexer is never used to decide access.

More detail: [docs/architecture.md](docs/architecture.md).

## Build on it

**From an MCP client.** Any client that speaks MCP over HTTP can connect with an agent token. The tools:

| Tool | What it does |
| --- | --- |
| `hive_write_memory` | Write a memory under a topic, with an optional gist, kind and entities |
| `hive_save_session` | Save the agent's own summary of the conversation |
| `hive_list_memory` | List what others shared: gist and preview, no full content |
| `hive_read_memory` | Read full content, newest 20 or chosen slot ids |
| `hive_search_memory` | Ranked search inside what the agent may read |
| `hive_whoami` | The agent's identity and when its session ends |

**From code.** [`@hive/mcp-client`](packages/mcp-client) is a small typed client (a workspace package, not on npm yet):

```ts
import { HiveClient } from "@hive/mcp-client";

const hive = new HiveClient({ mcpUrl: process.env.HIVE_MCP_URL!, agentToken: process.env.HIVE_AGENT_TOKEN! });

await hive.writeMemory({ topic: "work", content: "Launch moved to Friday" });
const { memories } = await hive.readMemory({ topic: "work" }); // [] when no edge covers it
```

**From HTTP.** Every route is in the [Swagger UI](https://hivebridge-production.up.railway.app/docs), generated from the zod schemas in [`packages/shared/src/schema`](packages/shared/src/schema). Those schemas are the contract between the bridge, the web app and the agents.

**From the chain.** Permissions are plain contract state, so another app can check them without us: `KnowledgeGraph.hasPermission(from, to, topic)`. ABIs and addresses are exported from `@hive/shared`.

**From the indexer.** Once it is deployed, the history is one GraphQL query away. For example, an owner's totals and any delivery that no edge explains:

```graphql
query ($owner: String!) {
  OwnerStats(where: { id: { _eq: $owner } }) { agents edgesAdded edgesRevoked memories propagations violations }
  PolicyViolation(where: { owner: { _eq: $owner } }) { fromAgent toAgent topic txHash reason }
}
```

**Run your own bridge.** Nothing ties you to ours. `pnpm --filter @hive/bridge dev` starts one on `:4000` with the keys from `.env.example` (your own Supabase project and funder key). `BRIDGE_CHAIN=memory` runs it against an in-process chain with no network.

## What uses Monad

| Building block | Status |
| --- | --- |
| **ERC-8004 agent identity** | Every agent can also be registered in the public ERC-8004 Identity Registry, with a `hiveAgentId` metadata entry and an agent card served by the bridge. Built and unit-tested, and the call was simulated against the deployed registry. No transaction has been sent yet ([ADR-028](docs/decisions.md)). We use the identity registry only, not reputation or validation. |
| **P256 precompile** | Not used. The passkey is used for its PRF output, from which secp256k1 keys are derived, so no passkey signature is verified onchain. |
| **BTX encrypted mempool** | Not used. |
| **Gas model** | Every transaction declares an explicit `gas`, because Monad charges the declared limit. |

## Keys (Mera)

One passkey produces every key. Nothing secret is stored on a server or on disk.

```
passkey PRF output (32 bytes, Mera's default salt)
  └─ 24-word BIP-39 recovery phrase
       └─ seed
            ├─ m/44'/60'/0'/0/0      owner key: signs agents and edges
            ├─ m/44'/60'/0'/0/{n}    agent key n: sends that agent's memory writes
            └─ HKDF("hive/encrypt")  AES-256-GCM key for memory content   ← not account work
```

| Secret | Where it lives | For how long |
| --- | --- | --- |
| Recovery phrase, owner key | Browser memory | Until sign-out or reload. Shown only after a fresh passkey prompt |
| Encryption key, agent keys | Browser memory, and bridge process memory for agents you authorized | Bridge: until the agent session ends, 24 h at most. Never on disk |
| User token (24 h) | `localStorage` | It can list agents and end sessions. It cannot sign or decrypt |
| Agent tokens (24 h) | `sessionStorage` | Until the tab closes or sign-out |

The same passkey on a second device derives the same phrase, so the same address and the same decryption key. A recorded cross-device run is still to do. All keys come from one PRF salt and are separated by derivation path and HKDF info, not by one salt per key.

## Indexer (Envio)

[`packages/indexer`](packages/indexer) is an Envio HyperIndex over five contracts and eight events. It does more than mirror events:

- **Joins that close contract gaps.** `EdgeRemoved` carries no from, to or topic, `Propagate` carries no slot id, and `MemoryWritten` carries no propagated count. The handlers rebuild all three.
- **Derived entities.** Per-edge propagation counts and lifetimes, and stats per agent, per topic and per owner.
- **A policy check.** `PolicyViolation` records any `Propagate` that no active, unexpired edge explains. It is expected to stay empty, so the indexer audits the protocol.
- **A cross-registry join.** ERC-8004 identities are joined to our agents, but only after checking that both have the same owner.

The web app's audit page, provenance card and stats strip read it. Status: tested with simulated events and synced locally against testnet on 11 Oct (7 agents, 4 edges, 2 propagations, 0 violations). Not on Envio Cloud yet.

## What you have to trust

| | |
| --- | --- |
| **You own** | The passkey, the recovery phrase and the encryption key. The phrase opens the same account in any BIP-39 wallet |
| **Public by design** | Agent names and types, edges, topic names and content hashes. Do not put anything sensitive in a topic or an agent name |
| **Trusted today** | The bridge operator, during an agent session: the bridge holds the keys of authorized agents and decrypted memories in process memory. Supabase, for availability only: it holds ciphertext |
| **Outside our control** | An authorized read hands the text to the reading agent and so to its model provider |

## Who it is for

- **MCP server authors** who give every caller the same API key today. Here each agent has an onchain identity, and what it may read is a signed edge.
- **Multi-agent frameworks** whose agents share one store with no rules between them. Here sharing is per pair and per topic, and can expire.
- **People running several coding agents** who paste context from one to another by hand.

Why not roll your own: a revoke takes effect on the next read, the permission history is public and indexed, and the decryption key stays with the owner instead of with a vendor.

## What is real

| | Status |
| --- | --- |
| Contracts | **Deployed** on Monad testnet. 55 Foundry tests |
| Agents and edges signed with a passkey-derived key | **Run on testnet**, 10 Oct |
| MCP write, read and revoke with two Claude Code agents | **Run on testnet**, 10 Oct |
| Encrypted storage, ciphertext only | **Live** |
| Bridge on Railway, web on Vercel | **Live** |
| Envio indexer | **Built**, synced locally. Not on Envio Cloud |
| ERC-8004 identity | **Built**, no transaction sent yet |
| Memory search and structured memory | **Built**, measured on fixtures. No live run |
| claude.ai, Claude Desktop and ChatGPT connectors (OAuth) | **Built**, not yet run against those clients |
| DeepSeek runner, propagation animation | Planned |

Every run we checked, and what each one did not check, is in [docs/roadmap.md](docs/roadmap.md).

## Run it locally

Requires Node 22+, pnpm 11 and [Foundry](https://getfoundry.sh).

```bash
git clone --recurse-submodules <repo-url>   # already cloned? run: git submodule update --init
corepack enable pnpm
pnpm install
cp .env.example .env

pnpm dev                      # web on :3000, bridge on :4000
pnpm build                    # every workspace, including forge build
pnpm -r --if-present test     # unit tests
```

## Repo layout

| Path | What |
| --- | --- |
| [`packages/contracts`](packages/contracts) | `AgentRegistry`, `KnowledgeGraph`, `MemorySlots`, `PropagationEngine` (Foundry) |
| [`apps/bridge`](apps/bridge) | MCP server, HTTP API, OAuth server, permission check, encrypted store |
| [`packages/shared`](packages/shared) | Chain config, ABIs, zod schemas: the interface everything else follows |
| [`packages/crypto`](packages/crypto) | AES-256-GCM `encrypt`, `decrypt`, `contentHash` |
| [`packages/mcp-client`](packages/mcp-client) | Typed client for the bridge |
| [`packages/indexer`](packages/indexer) | Envio HyperIndex: `config.yaml`, `schema.graphql`, handlers |
| [`apps/web`](apps/web) | Reference client: canvas, audit page, connect guides (Next.js 15) |
| [`apps/agents`](apps/agents) | DeepSeek runner (planned until a live run) |

## Docs

- [Architecture](docs/architecture.md): layers, flows and the trust model
- [Decisions](docs/decisions.md): every architectural decision, as ADRs
- [Roadmap](docs/roadmap.md): what is done, and every verified run
- [Gotchas](docs/gotchas.md): known pitfalls with passkeys, Monad gas and pnpm
- [Deployment](docs/deployment.md): the hosted URLs and the settings they need
- [Feedback](docs/feedback.md): what we ran into with Monad, Mera, Envio and MCP
- [Contributing](docs/contributing.md) · [AGENTS.md](AGENTS.md)

## Team

| Role | Owns |
| --- | --- |
| P1: Contracts | AgentRegistry, KnowledgeGraph, MemorySlots, tests, deploy |
| P2: Backend / infra | Encrypted storage, MCP bridge, Envio indexer, passkey auth |
| P3: Canvas frontend | React Flow canvas, edge editor, audit page |
| P4: Agents & pitch | Agent integrations, docs, demo script |
