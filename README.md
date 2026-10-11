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
| **Indexer** (Envio Cloud, GraphQL) | https://indexer.dev.hyperindex.xyz/5a8ecda/v1/graphql |
| **Demo video** | In progress |
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
2. Create a passkey. The Connect page and the wallet menu show your address.
3. Send testnet MON to that address from https://faucet.monad.xyz. Your address pays its own gas ([ADR-006](docs/decisions.md)).
4. Create two agents from the canvas sidebar, then drag from one to the other and sign the edge with the passkey.
5. Open an agent's drawer and copy its `claude --mcp-config` command into a terminal with Claude Code. Do the same for the second agent in a second terminal.
6. Ask the first agent to save something to Hive, then ask the second to read it. Revoke the edge on the canvas and the next read returns nothing.

Steps 4 to 6 were run on 10 Oct with a local web app and bridge, including the revoke ([roadmap, verified runs](docs/roadmap.md)). On 11 Oct agents, edges, ERC-8004 identities and memory writes were made through the hosted bridge; the transactions are under [Proof on testnet](#proof-on-testnet).

## Proof on testnet

Everything below is on Monad testnet and can be checked without us. It was made by one owner, `0xf45a…0214`, through the hosted bridge, and read back from the chain and the indexer on 11 Oct.

| Step | Evidence |
| --- | --- |
| An agent is registered | Agent 10, [register](https://testnet.monadscan.com/tx/0xa90222448fc1a272dff277857f8b1f3842c29c32844431e2ed5f869afc16a928) |
| It gets an ERC-8004 identity | Identity 2146 in the public registry, [register](https://testnet.monadscan.com/tx/0x351d234290921f6771110165d4e489d63decb15d0b43dafdb7ae7eadd3b6f25a). Its URI is the [agent card](https://hivebridge-production.up.railway.app/agents/10/card.json) the bridge serves |
| The owner signs edges both ways | Edge 12, agent 10 → 11, [addEdge](https://testnet.monadscan.com/tx/0xb113702546cfc969939feffaffaedb4a362b502e0775e2f5b2f88d4acfbd87a9), and edge 11, agent 11 → 10, [addEdge](https://testnet.monadscan.com/tx/0xf45fd0c1c4c470a36d9e75aa4ac05fa876574c556041dcb9f6b7bb9d1dacddfd) |
| An agent writes a memory and it propagates | Slot 6 from agent 10 (type `claude`), sent by its own key [`0x6518…5917`](https://testnet.monadscan.com/address/0x6518E5a12F9F78ceF988e9c48c41d761E6fD5917), [write](https://testnet.monadscan.com/tx/0xac8240fbc370275f729dd95bf04b3593d76d39ae6ad1544b9c31c3c84abdfd9e): `MemoryWritten`, then `Propagate` to agent 11 along edge 12 |
| The other agent writes back | Slot 7 from agent 11 (type `gpt`), sent by its own key [`0x1Fe8…387c`](https://testnet.monadscan.com/address/0x1Fe8563Be900a9532e5Cdd1e9E020DCB5f32387c), [write](https://testnet.monadscan.com/tx/0xa5c28839840be3a856306429a373db1e2760ff3ab76a84edc61de03a9274d3ee): `Propagate` to agent 10 along edge 11 |
| A later save shows up without anyone touching the indexer | Slot 8 from agent 10, [write](https://testnet.monadscan.com/tx/0x38aa295715acc45f80cd165a2eeea787b3599002ea3775f3cb9235f6c3dd6f92), topic `general`: `Propagate` to agent 11 along edge 12. The indexer returned the slot and its propagation when queried right after |
| A save from ChatGPT reaches the Claude agents | Slot 10 from agent 11 (type `gpt`), sent by its own key, [write](https://testnet.monadscan.com/tx/0x27163bf07c4c69a314022de73e3d72d46979005052165df4d9e3b435962bbbfd) at 12:02 UTC on 11 Oct: `Propagate` to agents 10 and 12, both type `claude`. That the save was made in chatgpt.com through the connector, and that Claude then read it, is reported by the team; a read leaves nothing onchain |
| The indexer has all of it | The [GraphQL endpoint](https://indexer.dev.hyperindex.xyz/5a8ecda/v1/graphql) returns these agents, edges, slots and propagations, joins the four identities to their agents, and reports 0 policy violations |

The owner's address sent the registrations and the edges; each write was sent by the writing agent's own key, which the owner derived from the passkey and the bridge holds only for the session. Only the content hash and the topic name are in those transactions. The memory text is ciphertext in Supabase.

The same owner also signed in on a second device, an iPad, with the same Google Password Manager passkey and got the same address, then agent 10 wrote slot 9 ([write](https://testnet.monadscan.com/tx/0x3e390fdc50a158240b54d2de93af746e55e33907033657eeb453e1d38bf58216), propagated to agents 11 and 12). The address on the iPad is the owner's report; the write is onchain.

Not shown by these links: a revoke on this owner's edges (none has been revoked yet; a revoke was run on 10 Oct, see the [roadmap](docs/roadmap.md)).

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

**From the indexer.** The history is one GraphQL query away, with no key, at `https://indexer.dev.hyperindex.xyz/5a8ecda/v1/graphql`. For example, an owner's totals and any delivery that no edge explains:

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
| **ERC-8004 agent identity** | Every agent can also be registered in the public ERC-8004 Identity Registry, with a `hiveAgentId` metadata entry and an agent card served by the bridge. Four agents have one on testnet, identities 2144 to 2147, and the indexer joins each to its agent ([ADR-028](docs/decisions.md)). We use the identity registry only, not reputation or validation. |
| **P256 precompile** | Not used. The passkey is used for its PRF output, from which secp256k1 keys are derived, so no passkey signature is verified onchain. |
| **BTX encrypted mempool** | Not used. |
| **Gas model** | Every transaction declares an explicit `gas`, because Monad charges the declared limit. |

## Keys (Mera)

One passkey, two PRF namespaces, one prompt. The passkey is asked for two salts in the same ceremony and returns two outputs that share nothing. The first is the account. The second does no account work: it only encrypts memory. Nothing secret is stored on a server or on disk ([ADR-029](docs/decisions.md)).

```
passkey
  ├─ PRF, Mera's default salt                    account namespace
  │    └─ 24-word BIP-39 recovery phrase
  │         └─ seed
  │              ├─ m/44'/60'/0'/0/0      owner key: signs agents and edges
  │              └─ m/44'/60'/0'/0/{n}    agent key n: sends that agent's memory writes
  │
  └─ PRF, salt sha256("hive/prf/memory/v1")      memory namespace   ← not account work
       └─ HKDF("hive/memory-key/v1")      AES-256-GCM key for memory content
```

What the split changes:

- **The recovery phrase is not the memory key.** Someone who learns the phrase controls the account but cannot decrypt a memory written under the memory namespace. Reading needs the passkey itself.
- **The account keys say nothing about the memory key**, and the other way round. Neither output can be computed from the other.
- **One prompt.** Our WebAuthn client sends both salts in one request. An authenticator that answers only the first is asked again through Mera with the memory salt, which is a second prompt. If both outputs come back equal, sign-in is refused.
- **Older memories still open.** Memories sealed before the split used a key taken from the seed (`HKDF("hive/encrypt")`). That key is kept for decrypting only and nothing new is sealed with it.

| Secret | Where it lives | For how long |
| --- | --- | --- |
| Recovery phrase, owner key | Browser memory | Until sign-out or reload. Shown only after a fresh passkey prompt |
| Encryption key, agent keys | Browser memory, and bridge process memory for agents you authorized | Bridge: until the agent session ends, 24 h at most. Never on disk |
| User token (24 h) | `localStorage` | It can list agents and end sessions. It cannot sign or decrypt |
| Agent tokens (24 h) | `sessionStorage` | Until the tab closes or sign-out |

Both namespaces are deterministic, so the same passkey on a second device gives the same address and the same memory key. On 11 Oct the same Google Password Manager passkey signed in on a Mac and on an iPad and gave the same address ([roadmap](docs/roadmap.md)). On the iPad it took one passkey prompt. Not recorded yet: Safari with iCloud Keychain and 1Password, and opening a memory sealed under the new key on the second device.

## For the bounties

**Envio.** HyperIndex drives three things a user sees: the audit page, the provenance card of a memory, and the stats strip with the "deliveries without an active edge" check. It also lets the canvas show an ERC-8004 identity added from another browser.

| Asked for | Where |
| --- | --- |
| `config.yaml`, `schema.graphql`, handlers | [`config.yaml`](packages/indexer/config.yaml), [`schema.graphql`](packages/indexer/schema.graphql), [`src/handlers`](packages/indexer/src/handlers) |
| Deployed indexer | Envio Cloud: https://indexer.dev.hyperindex.xyz/5a8ecda/v1/graphql |
| Something that consumes it | [`apps/web/lib/hive/live/audit.ts`](apps/web/lib/hive/live/audit.ts): the four queries the web app sends |
| Depth | Five contracts, eight events, three joins the contracts do not give, derived stats, a policy check, and a join to a registry that is not ours |

**Mera.** One passkey, two PRF namespaces. Mera's default salt gives the account: the recovery phrase, the owner key and one key per agent, which the owner hands to the bridge for a session. A second salt, `sha256("hive/prf/memory/v1")`, gives a key that does no account work at all: the AES-256-GCM key that encrypts memory content ([`apps/web/lib/passkey/keys.ts`](apps/web/lib/passkey/keys.ts)). Both are read in one passkey prompt ([`webauthn.ts`](apps/web/lib/passkey/webauthn.ts), [`mera.ts`](apps/web/lib/passkey/mera.ts)).

| Asked for | Where |
| --- | --- |
| A PRF namespace doing non-account work | The memory namespace, under its own salt: memory is encrypted with its key and the owner decrypts their own memories in the browser with it ([ADR-029](docs/decisions.md), [ADR-024](docs/decisions.md)) |
| Nothing sensitive persisted | See the table under [Keys](#keys-mera). No key is stored; two 24 h tokens are |
| Cross-device | Both namespaces are deterministic, so a synced passkey gives the same address and the same memory key. Run on 11 Oct, Mac and iPad with Google Password Manager: same address on both. Decrypting a memory on the second device is not recorded |

Two honest limits. Inside the account namespace the owner key and the agent keys still come from one salt and are separated by derivation path, not by one salt each. And the two-salt prompt has run on one authenticator only, Google Password Manager, where it took one prompt; the others are not run.

## Indexer (Envio)

[`packages/indexer`](packages/indexer) is an Envio HyperIndex over five contracts and eight events. It does more than mirror events:

- **Joins that close contract gaps.** `EdgeRemoved` carries no from, to or topic, `Propagate` carries no slot id, and `MemoryWritten` carries no propagated count. The handlers rebuild all three.
- **Derived entities.** Per-edge propagation counts and lifetimes, and stats per agent, per topic and per owner.
- **A policy check.** `PolicyViolation` records any `Propagate` that no active, unexpired edge explains. It is expected to stay empty, so the indexer audits the protocol.
- **A cross-registry join.** ERC-8004 identities are joined to our agents, but only after checking that both have the same owner.

The web app's audit page, provenance card and stats strip read it. Status: deployed on Envio Cloud and synced to the chain head when queried on 11 Oct: 11 agents, 12 edges, 7 memory slots, 10 propagations, 40 audit rows, 0 violations, and 45 ERC-8004 identities of which 4 are joined to our agents.

## What you have to trust

| | |
| --- | --- |
| **You own** | The passkey, the recovery phrase and the encryption key. The phrase opens the same account in any BIP-39 wallet, but not the memories: those need the passkey |
| **Public by design** | Agent names and types, edges, topic names and content hashes. Do not put anything sensitive in a topic or an agent name |
| **Trusted today** | The bridge operator, during an agent session: the bridge holds the keys of authorized agents and decrypted memories in process memory. Supabase, for availability only: it holds ciphertext |
| **Outside our control** | An authorized read hands the text to the reading agent and so to its model provider |

## Who it is for

- **MCP server authors** who give every caller the same API key today. Here each agent has an onchain identity, and what it may read is a signed edge.
- **Multi-agent frameworks** whose agents share one store with no rules between them. Here sharing is per pair and per topic, and can expire.
- **People running several coding agents** who paste context from one to another by hand.

Why not roll your own: a revoke takes effect on the next read, the permission history is public and indexed, and the decryption key stays with the owner instead of with a vendor.

## What comes next

- Run the claude.ai, Claude Desktop and ChatGPT connectors against the hosted bridge. The OAuth server for them is built ([ADR-019](docs/decisions.md)).
- The two-salt prompt recorded on Safari with iCloud Keychain and on 1Password, and a memory opened on the second device.
- Publish `@hive/mcp-client` to npm, so building on the bridge does not need this repo.
- A contract redeploy that carries what is waiting in the source: `setExpiry`, so an edge's expiry changes in place ([ADR-027](docs/decisions.md)).
- The rename from Hive to Mindshare in code, as one scripted change ([ADR-008](docs/decisions.md)).

## What is real

| | Status |
| --- | --- |
| Contracts | **Deployed** on Monad testnet. 55 Foundry tests |
| Agents and edges signed with a passkey-derived key | **Run on testnet**, 10 Oct |
| MCP write, read and revoke with two Claude Code agents | **Run on testnet**, 10 Oct |
| Encrypted storage, ciphertext only | **Live** |
| Bridge on Railway, web on Vercel | **Live** |
| Envio indexer | **Live** on Envio Cloud, synced to head on 11 Oct |
| ERC-8004 identity | **Run on testnet**, 11 Oct: four agents registered and joined in the indexer |
| Memory key in its own PRF namespace | **Live**. Signed in on two devices with one passkey and one prompt on 11 Oct; a decrypt on the second device not recorded |
| Memory search and structured memory | **Built**, measured on fixtures. On 11 Oct an agent searched agent 10's memories on the hosted bridge and its answer named slots 6 and 8, which are that agent's slots onchain. The tool calls themselves were not captured, so whether ranking used embeddings is not known |
| claude.ai, Claude Desktop and ChatGPT connectors (OAuth) | **Run**, 11 Oct, as reported by the team: the Claude connector added from an iPad, Claude Desktop, Codex CLI, and a save from chatgpt.com that a Claude agent read ([slot 10](https://testnet.monadscan.com/tx/0x27163bf07c4c69a314022de73e3d72d46979005052165df4d9e3b435962bbbfd)). The chain shows the write and its propagation, not which client made it |
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
