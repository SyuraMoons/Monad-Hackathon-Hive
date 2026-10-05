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

**Consequences.** Any script on the page can read the token. It can list agents, end agent sessions and read the event stream, but it cannot sign a transaction or authorize an agent, which need the keys. The bridge does not revoke user tokens, so signing out clears only this browser. Mock mode keeps its state in memory and still asks to log in after a reload. Agent sessions on the bridge are still in memory: a bridge restart needs a new authorize on `/connect`.
