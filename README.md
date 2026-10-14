# Hive

**An onchain permission layer for AI agent memory.** An agent can read another agent's memory only if the owner signed a permission edge for it on Monad. With no edge, nothing is shared. Memory content is encrypted with a key derived from the owner's passkey and is never put onchain.

It is built for developers to build on: four contracts, an MCP server any agent can call, a typed client, and an indexer that audits the whole history. The canvas in `apps/web` is the reference client, where the owner draws the edges.

Its first users are developers who run several coding agents at once and carry context between them by hand ([who it is for](#who-it-is-for)). A developer outside the team has already run it on testnet ([who has tried it](#who-has-tried-it)).

> Monad Metropolis Hackathon · Track 4 (Trust, Identity & AI) · also entered for the Envio and Mera bounties.

> **Notice.** This repository is a hackathon submission, published so that judges and reviewers can read and run it. **No license is granted** for the source and all rights are reserved: please do not copy, reuse or redistribute the code. See [NOTICE.md](NOTICE.md).
>
> What is open to build on today is what is deployed: the contracts on Monad testnet, the hosted bridge and the indexer. Calling them needs no copy of this code ([Build on it](#build-on-it)).

## Live

| | |
| --- | --- |
| **App** (reference client) | https://monad-hackathon-eta.vercel.app |
| **Bridge** (MCP server and HTTP API) | https://hivebridge-production.up.railway.app · [`/health`](https://hivebridge-production.up.railway.app/health) · [`/docs`](https://hivebridge-production.up.railway.app/docs) (Swagger) · [`/openapi.json`](https://hivebridge-production.up.railway.app/openapi.json) |
| **Agent card** (ERC-8004) | [`/agents/1/card.json`](https://hivebridge-production.up.railway.app/agents/1/card.json) |
| **Indexer** (Envio Cloud, GraphQL) | https://indexer.dev.hyperindex.xyz/5a8ecda/v1/graphql |
| **Demo video** | https://youtu.be/93VHQZhWvCQ |
| **Pitch video** | https://youtu.be/c7st0s-S7Cw |

[![Hive technical demo](https://img.youtube.com/vi/93VHQZhWvCQ/hqdefault.jpg)](https://youtu.be/93VHQZhWvCQ)

Contracts on Monad testnet (chain 10143):

| Contract | Address |
| --- | --- |
| `AgentRegistry` | [`0x06F4401cF289bfc29de59Fc1B624096Dc69ff25B`](https://testnet.monadscan.com/address/0x06F4401cF289bfc29de59Fc1B624096Dc69ff25B) |
| `KnowledgeGraph` | [`0x80db4a46BEE029464Aa1fca083985d1C5178AFd6`](https://testnet.monadscan.com/address/0x80db4a46BEE029464Aa1fca083985d1C5178AFd6) |
| `MemorySlots` | [`0xdE8DAf9599366b2ef8Ae245bF574808844Aa5f8a`](https://testnet.monadscan.com/address/0xdE8DAf9599366b2ef8Ae245bF574808844Aa5f8a) |
| `PropagationEngine` | [`0x4af2CC25026f918E88d727704D3FB888C20b0397`](https://testnet.monadscan.com/address/0x4af2CC25026f918E88d727704D3FB888C20b0397) |
| ERC-8004 Identity Registry (not ours) | [`0x8004A818BFB912233c491871b3d84c89A494BD9e`](https://testnet.monadscan.com/address/0x8004A818BFB912233c491871b3d84c89A494BD9e) |

## Try it (for judges)

There is no test account: the login is a passkey you create yourself, and it is the only key. To see it without setting anything up, watch the [demo video](https://youtu.be/93VHQZhWvCQ).

1. Open the [app](https://monad-hackathon-eta.vercel.app) in Safari with iCloud Keychain, or in Chrome with Google Password Manager, or with 1Password. A passkey saved locally in desktop Chrome cannot produce the key material and fails ([gotchas](docs/gotchas.md)).
2. Create a passkey. The Connect page and the wallet menu show your address.
3. Send testnet MON to that address from https://faucet.monad.xyz. Your address pays its own gas ([ADR-006](docs/decisions.md)).
4. Create two agents from the canvas sidebar, then drag from one to the other and sign the edge with the passkey.
5. Open an agent's drawer and copy its `claude --mcp-config` command into a terminal with Claude Code. Do the same for the second agent in a second terminal.
6. Ask the first agent to save something to Hive, then ask the second to read it. Revoke the edge on the canvas and the next read returns nothing.

Steps 4 to 6 were run on 10 Oct with a local web app and bridge, including the revoke ([roadmap, verified runs](docs/roadmap.md)). On 11 Oct agents, edges, ERC-8004 identities and memory writes were made through the hosted bridge; the transactions are under [Proof on testnet](#proof-on-testnet).

## Who it is for

**First: developers who run several coding agents at once.** One terminal with Claude Code, another with Codex, a ChatGPT tab for the design questions. While they build something, each agent knows only its own session, so the developer carries context from one to the next by hand. With Hive each agent saves to a topic and the others read it over MCP, and only where the owner drew an edge. Many of them also live on free tiers, so they have no choice but to switch: when one assistant's quota runs out they move to another, and the new one starts from nothing. If the old agent saved its session to Hive, the next one reads it and carries on, whichever vendor it is from.

This is the group the team comes from and can reach first: developers at our university who already work this way.

Then, with the same contracts and bridge:

| Who | Their problem today | What they would use |
| --- | --- | --- |
| **MCP server authors** | Every caller gets the same API key, so a tool cannot tell one agent from another | `KnowledgeGraph.hasPermission(from, to, topic)` as the check in front of a tool, and the agent's onchain identity |
| **Multi-agent frameworks** | All agents share one store with no rules between them | The bridge as the memory backend through [`@hive/mcp-client`](packages/mcp-client): sharing per pair and per topic, with an expiry |

### Why not roll your own

Rolling your own usually means one database and one API key that every agent shares. That has no rule per agent, a revoke means rotating the key for everyone, and there is no record of who could read what. Getting past that means building what is already here:

| You would have to build | Here |
| --- | --- |
| Permissions per pair and per topic, with expiry and revoke | [`KnowledgeGraph`](packages/contracts/src/KnowledgeGraph.sol), deployed, and readable by any app without us |
| A check that runs before any fetch or decrypt, and denies on doubt | [`permissions.ts`](apps/bridge/src/permissions.ts), read from live chain state so a revoke holds on the next read |
| Encryption whose key the vendor does not keep | A memory key from the owner's passkey, in its own PRF namespace ([Keys](#keys-mera)) |
| Sign-in for hosted agents | An OAuth server that the claude.ai and ChatGPT connectors accept ([`oauth.ts`](apps/bridge/src/oauth.ts)) |
| A history someone else can audit | The Envio indexer, with a check for any delivery no edge explains |
| Search that cannot widen access | Ranking inside the permitted set only, with encrypted vectors ([`search.ts`](apps/bridge/src/search.ts)) |

What it costs you: every write is a transaction on Monad testnet, and the bridge is trusted during an agent session ([What you have to trust](#what-you-have-to-trust)).

## Who has tried it

Developers outside the team ran Hive during the hackathon: university friends of the team, connecting Claude Code, Codex and ChatGPT agents. One of them is owner [`0xCd81…f238`](https://testnet.monadscan.com/address/0xCd8123EA42Ad7B8D74f494041DF82322BFA8f238), and what that address did is onchain:

| Step | Evidence |
| --- | --- |
| Registers a `claude` agent, 11 Oct | Agent 13, [register](https://testnet.monadscan.com/tx/0xbb1fa4271b77365be3e65ceefdb4e8cd777144ede96f9e251c471980ef5a0364) |
| Registers a `gpt` agent, 13 Oct | Agent 56, [register](https://testnet.monadscan.com/tx/0x1ab7e78b722eebbaa00c2b913ea009befe9fd0d51b67c5fdf95c411946b609d9) |
| The `claude` agent writes three memories, 13 Oct, each delivered along one edge | Slots [23](https://testnet.monadscan.com/tx/0x4b210c32ac03468e3303aa10e9b5a16d4bcfb7810f6a4d31bb4c8a479bb0b713), [24](https://testnet.monadscan.com/tx/0x8abf15e34defcb4868e565403c1ae8fe36f5b399e27dc943e5467d5afd87898b) and [25](https://testnet.monadscan.com/tx/0xdf79c4555adf53767b2dbf59d5a93c9d67eb11ce2c35967575a86360082bb25c) |
| Revokes an edge, 13 Oct | Edge 34, agent 56 → 13: [addEdge](https://testnet.monadscan.com/tx/0xeda3ac96c9eeebad56ed258b52bbfeb15e2c5bce89271fc0aec77ef50a2ef392), then [removeEdge](https://testnet.monadscan.com/tx/0xfb191419640067760585e2d624bda51644e586c86cf5706fbe75ba4f19dc9b8e). In all, 8 edges added and 6 revoked, 0 policy violations |

Read from the indexer's `OwnerStats`, `Agent` and `MemorySlot` on 14 Oct. The chain shows what the address did, not who holds its passkey: that this owner is outside the team, and which clients the agents ran in, is the team's report. No other team has integrated Hive.

Across every owner, the indexer counted 19 owner addresses, 58 agents and 25 memories on 14 Oct, and 6 of those addresses have written a memory. An address is a passkey, not a person, and some of them are the team's own, including `0xf45a…0214` from [Proof on testnet](#proof-on-testnet), so this is a count of use and not of users.

## Getting more integrations

Planned, in this order:

1. Choose a license for the client and publish `@hive/mcp-client` to npm, so building on the bridge does not need this repo.
2. A quickstart that takes a developer from a new passkey to a first write and read between two agents, starting from [the two-agent manual test](docs/manual-test-two-agents.md).
3. Onboard more developers from our university who run several coding agents, one at a time, and record each one here: owner address, which agents, and the first write.
4. Take what they trip over into the quickstart and the Connect page before asking anyone further away.
5. Ask one MCP server author to put `hasPermission` in front of a tool, as the first integration that does not use our bridge.

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

Not shown by these links: a revoke. One made by another owner is linked under [Who has tried it](#who-has-tried-it), and one was run on 10 Oct (see the [roadmap](docs/roadmap.md)).

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

## Where it is in the code

Each claim above, the file that implements it and the test that covers it.

| Claim | Code | Test |
| --- | --- | --- |
| A permission is an edge the owner signed, per pair and per topic, with an expiry | [`KnowledgeGraph.sol`](packages/contracts/src/KnowledgeGraph.sol): `addEdge`, `removeEdge`, `hasPermission` | [`KnowledgeGraph.t.sol`](packages/contracts/test/KnowledgeGraph.t.sol) |
| Only the owner registers an agent and names the key that may write for it | [`AgentRegistry.sol`](packages/contracts/src/AgentRegistry.sol): `register`, `setAgentWriter` | [`AgentRegistry.t.sol`](packages/contracts/test/AgentRegistry.t.sol) |
| A write puts a content hash and a topic onchain, nothing else | [`MemorySlots.sol`](packages/contracts/src/MemorySlots.sol): `write` | [`MemorySlots.t.sol`](packages/contracts/test/MemorySlots.t.sol) |
| A write is delivered only along edges that allow it | [`PropagationEngine.sol`](packages/contracts/src/PropagationEngine.sol): `onMemoryWritten` emits `Propagate` | [`PropagationEngine.t.sol`](packages/contracts/test/PropagationEngine.t.sol), [`Integration.t.sol`](packages/contracts/test/Integration.t.sol) |
| The bridge checks the edge before it fetches or decrypts anything | [`permissions.ts`](apps/bridge/src/permissions.ts): `edgeAllows`, `permittedSlots`, called first by `candidates` in [`memory.ts`](apps/bridge/src/memory.ts) | [`permissions.test.ts`](apps/bridge/test/permissions.test.ts), including "a revoked edge denies immediately" |
| A failed chain read is an error, never "nothing shared" | [`memory.ts`](apps/bridge/src/memory.ts) | [`read-failures.test.ts`](apps/bridge/test/read-failures.test.ts) |
| Permissions are read from the chain, not from the indexer | [`chain.ts`](apps/bridge/src/chain.ts): `ViemChainReader` | [`chain.test.ts`](apps/bridge/test/chain.test.ts) |
| Six MCP tools, identity taken from the token | [`mcp.ts`](apps/bridge/src/mcp.ts), shapes in [`schema/mcp.ts`](packages/shared/src/schema/mcp.ts) | [`mcp.test.ts`](apps/bridge/test/mcp.test.ts), [`write.test.ts`](apps/bridge/test/write.test.ts) |
| Content is AES-256-GCM, and the hash onchain is of the ciphertext | [`packages/crypto`](packages/crypto/src/index.ts): `encrypt`, `decryptBytes`, `contentHash` | [`crypto.test.ts`](packages/crypto/test/crypto.test.ts) |
| The database holds ciphertext only | [`store.ts`](apps/bridge/src/store.ts), tables in [`supabase/migrations`](supabase/migrations) | [`store.test.ts`](apps/bridge/test/store.test.ts) |
| Search ranks inside the permitted set, and its vectors are stored encrypted | [`search.ts`](apps/bridge/src/search.ts), [`embeddings.ts`](apps/bridge/src/embeddings.ts) | [`search.test.ts`](apps/bridge/test/search.test.ts), [`embeddings.test.ts`](apps/bridge/test/embeddings.test.ts) |
| Agent keys live in bridge memory for a session, not on disk | [`sessions.ts`](apps/bridge/src/sessions.ts) | [`sessions.test.ts`](apps/bridge/test/sessions.test.ts) |
| The bridge tops up an agent key's gas, with caps | [`funder.ts`](apps/bridge/src/funder.ts) | [`funder.test.ts`](apps/bridge/test/funder.test.ts) |
| OAuth for the claude.ai and ChatGPT connectors | [`oauth.ts`](apps/bridge/src/oauth.ts), consent page in [`apps/web/app/oauth`](apps/web/app/oauth) | [`oauth.test.ts`](apps/bridge/test/oauth.test.ts) |
| One passkey gives the account keys and a separate memory key | [`keys.ts`](apps/web/lib/passkey/keys.ts), [`webauthn.ts`](apps/web/lib/passkey/webauthn.ts), [`mera.ts`](apps/web/lib/passkey/mera.ts) | [`keys.test.ts`](apps/web/lib/passkey/keys.test.ts), [`webauthn.test.ts`](apps/web/lib/passkey/webauthn.test.ts), [`mera.test.ts`](apps/web/lib/passkey/mera.test.ts) |
| The owner signs agents and edges in the browser, with explicit gas | [`account.ts`](apps/web/lib/hive/account.ts), [`gas.ts`](apps/web/lib/hive/gas.ts), [`live/edges.ts`](apps/web/lib/hive/live/edges.ts), [`live/registry.ts`](apps/web/lib/hive/live/registry.ts) | [`edges.test.ts`](apps/web/lib/hive/live/edges.test.ts), [`registry.test.ts`](apps/web/lib/hive/live/registry.test.ts) |
| ERC-8004 identity and the agent card | [`erc8004.ts`](packages/shared/src/erc8004.ts), [`live/identity.ts`](apps/web/lib/hive/live/identity.ts), the `/agents/:id/card.json` route in [`app.ts`](apps/bridge/src/app.ts) | [`erc8004.test.ts`](packages/shared/test/erc8004.test.ts), [`identity.test.ts`](apps/web/lib/hive/live/identity.test.ts), [`agent-card.test.ts`](apps/bridge/test/agent-card.test.ts) |
| The indexer rebuilds what events leave out and flags any delivery no edge explains | [`handlers`](packages/indexer/src/handlers), the check is in [`propagation.ts`](packages/indexer/src/handlers/propagation.ts) | [`handlers.test.ts`](packages/indexer/test/handlers.test.ts) |
| The canvas, the audit page and the connect guides | [`components/canvas`](apps/web/components/canvas), [`app/(app)/audit`](<apps/web/app/(app)/audit/page.tsx>), [`app/(app)/connect`](<apps/web/app/(app)/connect/page.tsx>) | |

## Build on it

Three of the ways below need nothing from this repository: an MCP client against the hosted bridge, the contracts, and the indexer. The typed client and a bridge of your own run this repository's code, which is not licensed for reuse yet ([NOTICE.md](NOTICE.md)): today that is for evaluating it.

**From an MCP client.** Any client that speaks MCP over HTTP can connect with an agent token. The tools, registered in [`apps/bridge/src/mcp.ts`](apps/bridge/src/mcp.ts):

| Tool | What it does |
| --- | --- |
| `hive_write_memory` | Write a memory under a topic, with an optional gist, kind and entities |
| `hive_save_session` | Save the agent's own summary of the conversation |
| `hive_list_memory` | List what others shared: gist and preview, no full content |
| `hive_read_memory` | Read full content, newest 20 or chosen slot ids |
| `hive_search_memory` | Ranked search inside what the agent may read |
| `hive_whoami` | The agent's identity and when its session ends |

Every successful result also carries `as: { agentId, name }`, the agent the call ran as, taken from the token.

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

**Run your own bridge.** The contracts do not know which bridge calls them, so ours is not the only one that can exist. `pnpm --filter @hive/bridge dev` starts one on `:4000` with the keys from `.env.example` (your own Supabase project and funder key). `BRIDGE_CHAIN=memory` runs it against an in-process chain with no network.

## What uses Monad

| Building block | Status |
| --- | --- |
| **ERC-8004 agent identity** | Every agent can also be registered in the public ERC-8004 Identity Registry, with a `hiveAgentId` metadata entry and an agent card served by the bridge. 45 agents had one on testnet when the indexer was queried on 14 Oct, the first four being identities 2144 to 2147, and the indexer joins each to its agent ([ADR-028](docs/decisions.md)). We use the identity registry only, not reputation or validation. |
| **P256 precompile** | Not used. The passkey is used for its PRF output, from which secp256k1 keys are derived, so no passkey signature is verified onchain. |
| **BTX encrypted mempool** | Not used. |
| **Gas model** | Every transaction declares an explicit `gas`, because Monad charges the declared limit: an estimate with a buffer in the browser ([`gas.ts`](apps/web/lib/hive/gas.ts)) and a clamped estimate in the bridge ([`chain.ts`](apps/bridge/src/chain.ts)). |

## Keys (Mera)

One passkey, two PRF namespaces, one prompt. The passkey is asked for two salts in the same ceremony and returns two outputs that share nothing. The first is the account. The second does no account work: it only encrypts memory. No key is written to disk or to a database: keys exist in browser memory, and in bridge process memory for the agents the owner authorized ([ADR-029](docs/decisions.md), table below).

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
- **No passkey signature goes onchain.** The passkey is used only for its PRF outputs, and the keys that sign transactions are secp256k1 keys derived from them. That is why the P256 precompile is not used.
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

- **Joins that close contract gaps.** `EdgeRemoved` carries no from, to or topic, `Propagate` carries no slot id, and `MemoryWritten` carries no propagated count. The handlers rebuild all three ([`graph.ts`](packages/indexer/src/handlers/graph.ts), [`propagation.ts`](packages/indexer/src/handlers/propagation.ts), [`memory.ts`](packages/indexer/src/handlers/memory.ts)).
- **Derived entities.** Per-edge propagation counts and lifetimes, and stats per agent, per topic and per owner ([`stats.ts`](packages/indexer/src/stats.ts)).
- **A policy check.** `PolicyViolation` records any `Propagate` that no active, unexpired edge explains ([`propagation.ts`](packages/indexer/src/handlers/propagation.ts)). It is expected to stay empty, so the indexer audits the protocol.
- **A cross-registry join.** ERC-8004 identities are joined to our agents, but only after checking that both have the same owner ([`identity.ts`](packages/indexer/src/handlers/identity.ts)).

The web app's audit page, provenance card and stats strip read it. Status: deployed on Envio Cloud and synced to the chain head when queried on 14 Oct: 58 agents under 19 owner addresses, 48 edges of which 17 are revoked, 25 memory slots, 31 propagations, 179 audit rows, 0 violations, and 226 ERC-8004 identities of which 45 are joined to our agents. On 11 Oct the same query gave 11 agents, 12 edges and 7 memory slots.

## What you have to trust

| | |
| --- | --- |
| **You own** | The passkey, the recovery phrase and the encryption key. The phrase opens the same account in any BIP-39 wallet, but not the memories: those need the passkey |
| **Public by design** | Agent names and types, edges, topic names and content hashes. Do not put anything sensitive in a topic or an agent name |
| **Trusted today** | The bridge operator, during an agent session: the bridge holds the keys of authorized agents and decrypted memories in process memory. Supabase, for availability only: it holds ciphertext |
| **Outside our control** | An authorized read hands the text to the reading agent and so to its model provider |

**What no single platform holds.** The permissions are contract state that any app can read, the history is public events that anyone can index, the memory key comes from the owner's passkey, and the agents on either end of an edge can come from different vendors. The bridge is the one central piece, and the contracts do not depend on it: another bridge can serve the same permissions ([Build on it](#build-on-it)).

## What comes next

- A recorded run of the claude.ai, Claude Desktop and ChatGPT connectors. They were used against the hosted bridge on 11 Oct, but that is the team's report: the chain shows a write, not which client made it ([ADR-019](docs/decisions.md)).
- The two-salt prompt recorded on Safari with iCloud Keychain and on 1Password, and a memory opened on the second device.
- A contract redeploy that carries what is waiting in the source: `setExpiry`, so an edge's expiry changes in place ([ADR-027](docs/decisions.md)).

## What is real

| | Status |
| --- | --- |
| Contracts | **Deployed** on Monad testnet. 55 Foundry tests |
| Agents and edges signed with a passkey-derived key | **Run on testnet**, 10 Oct |
| MCP write, read and revoke with two Claude Code agents | **Run on testnet**, 10 Oct |
| Encrypted storage, ciphertext only | **Live** |
| Bridge on Railway, web on Vercel | **Live** |
| Envio indexer | **Live** on Envio Cloud, synced to head on 14 Oct |
| ERC-8004 identity | **Run on testnet**, 11 Oct: four agents registered and joined in the indexer. 45 agents joined by 14 Oct |
| Memory key in its own PRF namespace | **Live**. Signed in on two devices with one passkey and one prompt on 11 Oct; a decrypt on the second device not recorded |
| Memory search and structured memory | **Run** on the hosted bridge, 11 Oct: `hive_search_memory` for "ERC-8004 registration status" answered `mode: "hybrid"` and ranked the ERC-8004 memory (slot 6) first, matched on text, entity and meaning. One query on three memories; ranking quality is otherwise measured on fixtures |
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

Four developers who run several coding agents at once themselves, which is where the problem comes from.

- Muhamad Harfi Ibadurahman
- Altaf Parves Shua Ilham
- Nalen Raditya Sadewa
- Akhnaf Fawzan Yogatrisna

Nobody held one fixed role. Between us the work covered the contracts and their deploy, the bridge with encrypted storage and the indexer, passkey sign-in, the canvas and audit page, and the agent connectors and docs.
