# Decisions (ADR log)

Short architecture decision records. To add one, append the next number and don't rewrite old entries. If a decision changes, add a new ADR that supersedes the old one.

---

## ADR-001: Auth is Mera only, no Privy
**Date:** 2026-09-26 · **Status:** accepted

**Context.** Monad provides Next.js starter templates built on Privy (embedded wallet and smart wallet). The PRD targets two Mera bounties ($2.5K each), which reward a passkey acting as the user's only key.

**Decision.** Use Mera (`@category-labs/mera`) as the only auth and key source. Don't clone the Privy templates.

**Consequences.** We build the login UI ourselves. If Mera's PRF support blocks us, the PRD's risk table allows falling back to Privy, which gives up the Mera bounties but keeps the product working. That fallback needs a new ADR.

## ADR-002: Kernel smart account owned by the Mera key, sponsored by Pimlico
**Date:** 2026-09-26 · **Status:** accepted (to be confirmed by the Mera smoke test)

**Context.** Mera derives a plain EOA, which would need MON for gas on every graph change. Monad's `next-serwist-privy-smart-wallet` template shows a working Kernel + Pimlico setup built with `permissionless`.

**Decision.** Copy that template's `useSmartWallet` pattern (`toKernelSmartAccount`, `createPimlicoClient`, `createSmartAccountClient`, EntryPoint v0.7), but pass the Mera viem account (`toViemAccount(session)`) as the owner instead of Privy's wallet.

**Consequences.** Transactions are gasless for users, and there's one more external dependency (a Pimlico API key). Fallback: send transactions from the Mera EOA directly and fund it from the faucet.

## ADR-003: pnpm + Turborepo monorepo, forge-std as a git submodule
**Date:** 2026-09-26 · **Status:** accepted

**Decision.** `apps/*` and `packages/*` workspaces, with turbo for `dev`/`build`/`lint`. Foundry lives in `packages/contracts`, and `forge-std` is a git submodule rather than vendored code.

**Consequences.** Clone with `--recurse-submodules`. pnpm 11 needs `allowBuilds` in `pnpm-workspace.yaml` for esbuild.

## ADR-004: Memory content never goes onchain
**Date:** 2026-09-26 · **Status:** accepted

**Decision.** Onchain data is limited to agent identities, permission edges, and hashes of memory content. Content itself is AES-GCM encrypted on the client and stored in Supabase.

**Consequences.** Anyone can audit permissions while content stays private. Supabase must never receive plaintext.

## ADR-005: Every key comes from a recovery phrase derived from the passkey PRF
**Date:** 2026-10-02 · **Status:** accepted

**Context.** Keys were derived by using the 32-byte PRF output directly as a BIP-32 master seed. That has no exportable backup, so `gotchas.md`'s "recover from the 24-word mnemonic" was not true. Mera's secret vaults (`createSecretVaultWithNewPasskey`) let one phrase sit behind several passkeys, which only works if the account is defined by the phrase rather than by one passkey's PRF.

**Decision.** PRF output → BIP-39 24-word phrase (the output is the entropy) → BIP-39 seed → owner `m/44'/60'/0'/0/0`, agents `m/44'/60'/0'/0/{n}`, encryption key `HKDF(seed, "hive/encrypt")`. The passkey is always a real Mera ceremony, in mock mode too: only the backend is mocked.

**Consequences.** Every owner address from before this change moves (nothing was deployed yet). The phrase opens the account in any BIP-39 wallet, so the UI only shows it behind a fresh passkey prompt and never stores it. Imported phrases and backup passkeys (secret vaults, #67) derive keys the same way.
