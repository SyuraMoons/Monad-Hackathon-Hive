# Decisions (ADR log)

Short architecture decision records. To add one, append the next number and don't rewrite old entries. If a decision changes, add a new ADR that supersedes the old one.

---

## ADR-001: Auth is Mera only, no Privy
**Date:** 2026-09-26 · **Status:** accepted

**Context.** Monad provides Next.js starter templates built on Privy (embedded wallet and smart wallet). The PRD targets two Mera bounties ($2.5K each), which reward a passkey acting as the user's only key.

**Decision.** Use Mera (`@category-labs/mera`) as the only auth and key source. Don't clone the Privy templates.

**Consequences.** We build the login UI ourselves. If Mera's PRF support blocks us, the PRD's risk table allows falling back to Privy, which gives up the Mera bounties but keeps the product working. That fallback needs a new ADR.

## ADR-002: Kernel smart account owned by the Mera key, sponsored by Pimlico
**Date:** 2026-09-26 · **Status:** superseded by ADR-006 (testnet: the Mera EOA pays gas, faucet-funded)

**Context.** Mera derives a plain EOA, which would need MON for gas on every graph change. Monad's `next-serwist-privy-smart-wallet` template shows a working Kernel + Pimlico setup built with `permissionless`.

**Decision.** Copy that template's `useSmartWallet` pattern (`toKernelSmartAccount`, `createPimlicoClient`, `createSmartAccountClient`, EntryPoint v0.7), but pass the Mera viem account (`toViemAccount(session)`) as the owner instead of Privy's wallet.

**Consequences.** Transactions are gasless for users, and there's one more external dependency (a Pimlico API key). Fallback: send transactions from the Mera EOA directly and fund it from the faucet.

## ADR-003: pnpm + Turborepo monorepo, forge-std as a git submodule
**Date:** 2026-09-26 · **Status:** accepted

**Decision.** `apps/*` and `packages/*` workspaces, with turbo for `dev`/`build`/`lint`. Foundry lives in `packages/contracts`, and `forge-std` is a git submodule rather than vendored code.

**Consequences.** Clone with `--recurse-submodules`. pnpm 11 needs `allowBuilds` in `pnpm-workspace.yaml` for esbuild.

## ADR-004: Memory content never goes onchain
**Date:** 2026-09-26 · **Status:** accepted, amended by ADR-009

**Decision.** Onchain data is limited to agent identities, permission edges, and hashes of memory content. Content itself is AES-GCM encrypted on the client and stored in Supabase.

**Consequences.** Anyone can audit permissions while content stays private. Supabase must never receive plaintext.

## ADR-005: Every key comes from a recovery phrase derived from the passkey PRF
**Date:** 2026-10-02 · **Status:** accepted

**Context.** Keys were derived by using the 32-byte PRF output directly as a BIP-32 master seed. That has no exportable backup, so `gotchas.md`'s "recover from the 24-word mnemonic" was not true. Mera's secret vaults (`createSecretVaultWithNewPasskey`) let one phrase sit behind several passkeys, which only works if the account is defined by the phrase rather than by one passkey's PRF.

**Decision.** PRF output → BIP-39 24-word phrase (the output is the entropy) → BIP-39 seed → owner `m/44'/60'/0'/0/0`, agents `m/44'/60'/0'/0/{n}`, encryption key `HKDF(seed, "hive/encrypt")`. The passkey is always a real Mera ceremony, in mock mode too: only the backend is mocked.

**Consequences.** Every owner address from before this change moves (nothing was deployed yet). The phrase opens the account in any BIP-39 wallet, so the UI only shows it behind a fresh passkey prompt and never stores it. Imported phrases and backup passkeys (secret vaults, #67) derive keys the same way.

## ADR-006: Gas on Monad testnet is paid by the Mera EOA, funded from the faucet
**Date:** 2026-10-02 · **Status:** accepted (confirmed by Harfi)

**Context.** ADR-002 planned a Kernel smart account sponsored by Pimlico. We run on testnet, where the faucet makes that unnecessary.

**Decision.** The Mera key signs and sends graph transactions directly (Akhnaf's Path A). No Pimlico, no Kernel.

**Consequences.** The owner address needs testnet MON. UI copy that says gas is "sponsored" (`WalletMenu.tsx`, `WalletChip.tsx`) is no longer accurate and must change, or the low-balance UI already in `EdgeEditorModal.tsx` must be switched on. AGENTS.md rule 8 (don't overclaim) applies.

## ADR-007: The agent key sends `MemorySlots.write`, and the bridge funds it
**Date:** 2026-10-03 · **Status:** accepted (Altaf; Akhnaf please confirm, no contract change needed)

**Context.** The deployed `MemorySlots.write` requires `msg.sender == registry.writerOf(agentId)`, so the agent's own key must send the transaction and hold MON.

**Decision.** On `POST /v1/agents/:id/authorize` the bridge tops up the agent key from a testnet-only funder key (`BRIDGE_FUNDER_PRIVATE_KEY`, in `.env` only), with a per-agent cap and a per-owner daily limit. Every write sets explicit `gas`.

**Consequences.** No redeploy, and users never fund agent keys by hand. The funder is a hot key: never reuse it anywhere else, and keep the balance small.

## ADR-008: The product is named Mindshare, and the rename is one scripted PR later
**Date:** 2026-10-02 · **Status:** accepted, rename not done

**Decision.** Use "Mindshare" in new user-facing text. Code, packages (`@hive/*`), MCP tools (`hive_*`) and env vars keep "Hive" until a single scripted rename PR (`scripts/rename-to-mindshare.mjs`, dry-run by default) lands on `development` after the open PR stacks merge. The team is told before it lands because MCP tool names and `@hive/shared` imports change.

**Consequences.** The HKDF info string `hive/encrypt` must never be renamed: it derives the encryption key from the passkey, and changing it makes all existing ciphertext unreadable. Demo and MCP focus is Claude and ChatGPT; Cursor is not a product we integrate.

## ADR-009: The bridge holds the delegated key and sees plaintext only in memory
**Date:** 2026-10-04 · **Status:** accepted (confirmed by Harfi)

**Context.** ADR-004 and hard rule 2 said content is encrypted on the client. The bridge write path (#77) encrypts on the bridge with the owner's delegated key from the authorized session, and reads decrypt there too, so plaintext reaches the bridge.

**Decision.** The bridge may hold plaintext in memory while it serves an authorized read or write. It never stores or logs it. Hard rule 2 in AGENTS.md is reworded to match.

**Consequences.** Plaintext must never appear in a log, an error message, an SSE event or a database row. Supabase still holds only ciphertext, and nothing but hashes goes onchain. Users trust the bridge operator with content during a session, which `docs/architecture.md` documents as the trust model.

## ADR-010: A session save is a summary the agent writes on request
**Date:** 2026-10-05 · **Status:** accepted

**Context.** The product idea is one shared "big brain" that the user's agents fill without hand-written notes, like `/compact`. The bridge never sees a conversation. Only the agent does.

**Decision.** Add the MCP tool `hive_save_session { summary, topic? }` (default topic `brain`). The agent writes the summary itself, guided by the server `instructions` sent in `initialize` and by the tool description. The bridge checks size (4096 bytes) and refuses the obvious secret shapes (private key blocks, `sk-` keys, JWTs), then stores it like any other memory, so encryption, edges and events are unchanged.

**Consequences.** Saving happens when the user asks, and summary quality depends on the model. Automatic saving is a separate follow-up that works only for clients with hooks (Claude Code). An agent never reads its own saves back (see gotchas), so a save is for the other agents.

## ADR-011: The user token survives a reload, the keys do not
**Date:** 2026-10-05 · **Status:** proposed

**Context.** The whole web session lived in memory, so every reload sent the user back to `/login`. The bridge user token is a 24h JWT signed with a fixed secret and the bridge keeps no user state, so a saved token keeps working after a reload and after a bridge restart.

**Decision.** In live mode the web app saves `{ owner, userToken, expiresAt, credentialId }` in `localStorage` (`hive:session`) and restores it on load. The owner, encryption and agent keys are never stored. After a reload the app is signed in but locked, and `unlock()` derives the keys again from the passkey (one touch) the first time an action needs them. At `expiresAt` the saved session is dropped and the user signs in again.

**Consequences.** Any script on the page can read the token. It can list agents, end agent sessions and read the event stream, but it cannot sign a transaction or authorize an agent, which need the keys. The bridge does not revoke user tokens, so signing out clears only this browser. Mock mode keeps its state in memory and still asks to log in after a reload. Agent sessions on the bridge are still in memory: a bridge restart needs a new authorize on `/connect`. The agent tokens the bridge issued are kept in `sessionStorage` (`hive:agent-tokens:<owner>`), so a reload of the tab keeps the commands on screen. A script on the page could read a 24h agent token for the life of the tab, which an agent key or an owner key it cannot. They end with the tab and at sign-out.

## ADR-012: Several named agents per type, and removal is hiding
**Date:** 2026-10-05 · **Status:** proposed

**Context.** The web app found an agent by its type, so a user could have one Claude and one GPT. Several Claude Code sessions in different project folders could not be separate nodes. `AgentRegistry` has no function to remove or deactivate an agent.

**Decision.** The bridge and the contracts already allow many agents per owner, so the web app does too. The Connect page lists a type's agents and creates a new one with a name (unique among the owner's agents, 64 characters at most). Each agent gets the next free agent key index. Registering is an owner transaction that costs gas, so it never runs automatically for a second agent. Removing an agent only hides it on this browser (`localStorage`) and ends its bridge session. It stays onchain, and the drawer refuses to hide an agent that still has an active edge.

**Consequences.** `claude mcp add` keeps the `hive` server per project folder, so sessions in one folder are one agent. The default command is therefore per terminal (`claude --mcp-config '<json>'`), which writes nothing to the folder, so several agents can share one folder, one terminal each. The folder command stays as the alternative. A hidden agent comes back on another browser. The demo still shows Claude and ChatGPT only (the Demo agents line stays true for the pitch). Agents are created from the canvas sidebar as well as on Connect; a user who already has agents signs in to the canvas, and Connect is the first-run page. Registering is two transactions, so a stopped one leaves an agent with no writer key and "Finish setup" sends the second.

## ADR-013: An edge covers all topics by default
**Date:** 2026-10-05 · **Status:** proposed

**Context.** `KnowledgeGraph` stores `keccak256(topic)` and matches it exactly. `hive_save_session` writes to `brain` by default, but the edge editor only offered work, research and personal, so a default save could never be read.

**Decision.** An edge whose topic is `*` (`ALL_TOPICS` in `@hive/shared`) means every topic. The contract hashes `*` like any other string, so nothing is redeployed. The bridge allows it in `edgeAllows` (`permissions.ts`), on top of the usual checks (active, not expired, same sender and reader). The editor signs `*` by default and "Only one topic" restricts the edge to one. `*` is valid for edges only: a slot topic still has to match `^[a-z0-9-]{1,31}$`, so a real topic can never collide with it.

**Consequences.** Reads work along an all-topics edge, because the bridge decides them. `PropagationEngine` and `KnowledgeGraph.hasPermission` match exact hashes only, so an all-topics edge emits no `Propagate` event: `propagatedTo` stays empty, the canvas pulse does not fire for it, and the onchain `hasPermission` returns false. An edge for one topic behaves as before. Making the contracts treat `*` as a wildcard needs a redeploy of `KnowledgeGraph`, `PropagationEngine` and `MemorySlots`. The source change is in `Topics.sol`, `KnowledgeGraph.hasPermission` and `PropagationEngine.onMemoryWritten`, with tests; the deployed testnet contracts still match exact hashes until that redeploy.

## ADR-014: `hive_save_session` defaults to topic `general`
**Date:** 2026-10-05 · **Status:** proposed

**Context.** ADR-010 made `brain` the default topic of `hive_save_session`. The canvas never offered `brain`, and users do not think in topics when they tell an agent to save.

**Decision.** The default is `general` (`DEFAULT_TOPIC` in `@hive/shared`, renamed from `DEFAULT_BRAIN_TOPIC`). With an all-topics edge (ADR-013) the topic does not matter for reading, and `general` is a topic the user can also pick on an edge. An agent can still pass a topic. This supersedes the `brain` default of ADR-010.

**Consequences.** Memories already saved under `brain` stay readable through all-topics edges, and the web app still resolves `brain` edges. Nothing is migrated.

## ADR-015: Listing memories is cheap, reading them is explicit
**Date:** 2026-10-06 · **Status:** proposed

**Context.** `hive_read_memory` returned the full content of every readable slot, up to 4096 bytes each, so a read grew with the history and all of it landed in the agent's context. Letting agents query Supabase for an index was considered.

**Decision.** The chain is already the index: `MemorySlots.slotsSince` returns id, sender, topic, content hash and time. The bridge adds `hive_list_memory` (id, sender, topic, time, size and a 160-character preview, no full content) and gives `hive_read_memory` `slotIds`, `limit` (default 20, at most 50, newest first) and a `more` flag. Both run the same selection and the same permission check on live chain state. Agents never get a database credential: a direct query would need a second copy of the permission rules, the agent cannot decrypt, and a revoke would stop being immediate (rules 2 and 3).

**Consequences.** No migration and no new stored plaintext: the preview is computed from the decrypted content for an authorized reader, like `content`. A bare read now returns at most 20 memories, and `more: true` says older ones were left out. Still open: batching the ciphertext fetches, and search, which would need plaintext or a second encrypted column.


## ADR-018: Agent labels are a per-browser nickname
**Date:** 2026-10-09 · **Status:** proposed

**Context.** `AgentRegistry.register` writes the agent name and the contract has no rename. The owner still wants to call an agent something else, from a right-click menu on the canvas sidebar.

**Decision.** The owner can add a label to an agent. It is kept in `localStorage` (`hive:agent-labels:<owner>`, 64 characters at most) and shown instead of the registered name on the canvas, the sidebar and the drawer, which also prints `registered as <name>`. The registered name is never overwritten: name uniqueness, the Claude session name and the audit and feed pages keep using it.

**Consequences.** A label does not follow the owner to another browser and nothing about it goes onchain or to the bridge. The same menu offers "Take off canvas" (drops the saved position) and "Hide agent…", which is the ADR-012 hide. There is still no real delete.


## ADR-019: The bridge is its own OAuth authorization server for claude.ai and ChatGPT connectors
**Date:** 2026-10-10 · **Status:** proposed

**Context.** claude.ai, Claude Desktop and mobile call a custom connector from Anthropic's servers, so a command with a pasted token cannot reach the bridge. For a personal account a connector authenticates with OAuth (DCR or CIMD), no auth, or a static header that is a beta for organization Owners only and carries one shared key, which cannot say which agent is calling. No auth would let anyone with the URL act as an agent.

**Decision.** The bridge serves OAuth 2.1 itself, on the same origin as `/mcp`: protected-resource and authorization-server metadata under `/.well-known/`, `POST /oauth/register` (DCR), `GET /oauth/authorize`, `POST /oauth/token`. PKCE S256 is required and there are no client secrets. Only Claude's callback (`https://claude.ai/api/mcp/auth_callback`), ChatGPT's (`https://chatgpt.com/connector_platform_oauth_redirect`, or `https://chatgpt.com/connector/oauth/<id>` with one path segment and no query) and loopback URLs (Claude Code, any port) are accepted as redirect URIs. Every authorization response, success or error, carries `iss` (RFC 9207) and the metadata sets `authorization_response_iss_parameter_supported`, which ChatGPT requires to use its stable callback. A registered client id is a signed token that carries its redirect URIs, so registering stores nothing. The consent step is the existing agent authorization: `/oauth/authorize` sends the owner to the web app's `/oauth/authorize`, the owner signs in with the passkey, picks an agent and the web app calls `/v1/agents/:id/authorize` (keys into `SessionStore`) and then `POST /v1/oauth/approve`, which mints a 60-second single-use code for that live session. The access token is the same agent JWT as before, so identity still comes from the token. Refresh tokens rotate and work only while the agent's session lives, so a refresh never extends the 24 h session. Every 401 on `/mcp` carries `WWW-Authenticate: Bearer resource_metadata=…`, which is what makes Claude start sign-in. It is on only when `BRIDGE_PUBLIC_URL` and `BRIDGE_WEB_URL` are both set.

**Consequences.** Codes and refresh tokens are in memory like sessions, so a bridge restart or 24 h means the owner signs in again, and the bridge must run as one instance. One connector is one agent: to use another agent, remove the connector in Claude and connect again. CIMD is not offered, so Claude falls back to DCR and the bridge never fetches a client-supplied URL. The `resource` parameter is accepted and ignored: tokens only work on this bridge. The web consent page (`/oauth/authorize`) and the claude.ai tab of the Connect popup use it. Not yet run against a real claude.ai or ChatGPT.


## ADR-020: DeepSeek is a third agent type, connected through a local runner
**Date:** 2026-10-10 · **Status:** proposed

**Context.** The demo agents were Claude and ChatGPT only (ADR-012). DeepSeek's API is OpenAI-compatible chat completions with function tools, but unlike the OpenAI Responses API it has no hosted remote-MCP tool, so DeepSeek's servers cannot call the bridge.

**Decision.** `deepseek` joins `AGENT_TYPES` in `@hive/shared`. A DeepSeek agent is registered from the canvas like any other (`AgentRegistry` stores the type as a free string, so nothing is redeployed). It connects through a runner in `apps/agents`: the runner lists the bridge's MCP tools with the agent token, offers them to DeepSeek as function tools, runs each call through `@hive/mcp-client` and loops until the model answers. Identity still comes from the token, and the runner runs next to the user, so the bridge can stay on `localhost`. The API key, base URL and model come from the env, never from code. This supersedes the "Claude and ChatGPT only" line of ADR-012 and AGENTS.md.

**Consequences.** Clients built before this change read a `deepseek` agent as `other`. The runner never logs or stores tool results; memories a DeepSeek agent reads are sent to DeepSeek's API, and the Connect page says so. The work lands in layers (shared type, generic tool calls in `@hive/mcp-client`, the runner, the web app) and DeepSeek stays planned in the UI and docs until a live run is recorded in the roadmap.


## ADR-021: AgentRegistry lists an owner's agents in one call
**Date:** 2026-10-10 · **Status:** proposed

**Context.** The registry had no per-owner index, so the web and the bridge found an owner's agents by reading `agents(id)` from 1 until an unknown id. That is every agent anyone registered, and `/connect` ran it three times. The public Monad RPC allows 15 requests per second per IP and `eth_getLogs` over about 100 blocks, so the scan failed under load ("Could not read the agent registry.") and logs could not replace it.

**Decision.** `AgentRegistry` keeps `owner => agentId[]` and exposes `agentsOf(owner) returns (uint256[] ids, Agent[] list)`, oldest first. The web (`registryChain.ts`) and the bridge (`ViemChainReader.agentsOf`) call it once instead of scanning.

**Consequences.** `KnowledgeGraph` and `MemorySlots` hold the registry address as `immutable`, so all four contracts were redeployed and testnet state started empty: agents, edges and memory slots from the old addresses are gone, and ciphertext rows in Supabase keyed by old slot ids are orphaned. The lookup cost now grows with one owner's agents, not with the whole registry.


## ADR-022: Structured memory, delta reads and search, all inside the encrypted payload
**Date:** 2026-10-10 · **Status:** proposed, built

**Context.** ADR-015 capped a bare read at 20 memories and added previews, but an agent still picks what to read by recency and a 160-character cut of the text. As history grows it either loads too much into its context or misses the memory that matters. Search was left open because it "would need plaintext or a second encrypted column". The chain can't carry new fields (`MemorySlots` is append-only and stores `{id, agentId, contentHash, topic, writtenAt}`), and redeploying again is not an option (ADR-021).

**Decision.**
- **Envelope.** The plaintext that is encrypted becomes `hive-memory/v1\n{json}` with `content`, and optional `gist` (one line, 200 characters at most, written by the agent), `kind` (`decision | interface | fact | task | session | state`), `entities` (up to 10 exact-match handles) and `supersedes` (a slot id). Plaintext without the prefix is legacy content. `contentHash` still hashes `iv ‖ ciphertext`, so it now covers the metadata. `content` in read output stays the raw text.
- **Supersede and state.** `supersedes` is valid only for a slot of the same sender and topic, so hiding the old slot never leaks anything. A superseded slot is left out of list, read and search unless `includeSuperseded` is set. A `state` slot is a living summary per topic: only the newest one per sender and topic is shown.
- **Own reads.** List, read and search take `mine: true`, which selects the caller's own slots (identity from the token). The default stays "what others shared with me". This supersedes the "an agent never reads its own writes" gotcha for that flag only; edges are unchanged.
- **Delta reads.** Outputs carry a `cursor` (`<writtenAt>:<slotId>`), and an input `cursor` returns only newer slots. Slot ids are global and monotonic, so this fixes the inclusive-seconds overlap of `slotsSince`. With a cursor a call is a forward feed: the oldest `limit` visible slots after it, the cursor of the last one returned, and `more` meaning newer ones remain, so a backlog bigger than `limit` is delivered over several calls with nothing skipped. A batch that did not load, or a sender whose name did not resolve, ends the page before that memory instead of moving the cursor past it.
- **Search.** `hive_search_memory` runs the same permission selection as list, with the filter before any ranking, then ranks in the bridge: BM25 over gist, entities and content, an exact-entity boost and a recency factor. Embeddings are a second scorer behind the same tool: `multilingual-e5-small` (384 dimensions, quantized, computed in the bridge), with each vector AES-GCM encrypted in a new `memory_embedding` table, fused with the lexical rank (RRF). Backfill is capped per call and finished in the background. A local model is used so no plaintext goes to a third party.
- **Cost.** `CiphertextStore.getMany` (one query, replacing the N+1 fetch) and a per-session cache of decrypted documents, dropped with the session. Permission is still read from live chain state on every call.
- **Untrusted data.** Outputs carry a fixed notice that memories are data from other agents, not instructions, and `HIVE_INSTRUCTIONS` says the same. The DeepSeek runner imports the same text from `@hive/shared`.

**Consequences.** No contract change and no gas change. Plaintext, gist, entities and vectors never reach a log, an error, an SSE event or an unencrypted row. Slots written before this change read as legacy content with no gist, so they rank on text only. A forged `supersedes` pointing at another sender's slot is ignored. If the embedding model can't load, search stays lexical and `/health` reports it. Built and tested with in-memory fakes, and the real model was run locally; none of it has run against testnet or Railway yet, so the UI and docs call it built, not verified (rule 8). Embeddings are off by default (`HIVE_EMBEDDINGS`), need the `memory_embedding` migration applied, and add a model of about 120 MB and some hundred MB of memory to the bridge. The e5 similarity scale is compressed (right matches 0.80-0.875, wrong 0.72-0.81 in the roadmap run), so the floor `HIVE_EMBED_MIN_SIM` (default 0.78) only cuts the clearly unrelated and ranking does the rest.

## ADR-023: Topic and agent names are public onchain, and only the permission graph decides reads
**Date:** 2026-10-11 · **Status:** accepted (confirmed by Harfi)

**Context.** ADR-009 and hard rule 2 said "nothing but hashes goes onchain". That is not true of the deployed contracts: `MemorySlots` stores each memory's topic as text and emits it in `MemoryWritten`, and `AgentRegistry` stores each agent's name and type. Anyone can read them on a block explorer, and the chain cannot forget them. `KnowledgeGraph` stores only `keccak256(topic)`, but that hides nothing once the same topic is written to `MemorySlots`. Since ADR-022 the bridge also keeps decrypted memories per session, not only while it serves a call. And every authorized read hands plaintext to the reading agent and so to its model provider, which the rules did not say; the login page went as far as "the memory only you can read". Separately, a review of ADR-022 found that a `supersedes` written by one agent could change which of another sender's memories were visible. Rule 3 ("an LLM never decides") did not cover that, because no LLM was involved.

**Decision.** This supersedes the "nothing but hashes goes onchain" sentence of ADR-009; the rest of ADR-009 stands.
- Onchain: content hashes, plus metadata that is public by design: topic names (`MemorySlots`) and agent names and types (`AgentRegistry`). Docs and UI tell users not to put anything sensitive in a topic or an agent name.
- Anything derived from content counts as plaintext: previews, gists, entities, embedding vectors and search queries.
- The bridge may keep decrypted memories in process memory for at most the life of an agent session, never on disk.
- An authorized read sends plaintext to the reading agent's model provider. That is the product, not a leak, and docs and UI must not claim otherwise.
- Only the onchain permission graph decides what an agent may read, checked in deterministic code on live chain state before any fetch, decrypt or ranking. Models (LLMs, embeddings) and fields an agent wrote may only rank or hide memories inside the permitted set, and one agent's fields never affect another sender's memories.

**Consequences.** Hard rules 2 and 3 in AGENTS.md and the trust model in `docs/architecture.md` are reworded to match. No contract, gas or API change. Making topics private would need a contract that stores only a topic hash in `MemorySlots`, which means a redeploy (ADR-021); not planned.
