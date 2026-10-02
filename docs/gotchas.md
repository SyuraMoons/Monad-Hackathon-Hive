# Gotchas

Known pitfalls. Add to this list when you hit a new one.

## Passkeys (Mera)

- **Desktop Chrome returns PRF output only for Google Password Manager passkeys.** A passkey saved locally in Chrome fails with `PRF_UNAVAILABLE`. For the demo, use Safari + iCloud Keychain, 1Password, or Chrome + Google Password Manager.
- **Passkeys are tied to a domain (`rp.id`).** A passkey created on `localhost` won't work on the Vercel URL, and vice versa. Pick the demo domain early and don't change it. Moving domains means recovering from the 24-word mnemonic.
- **A secure context is required.** Use HTTPS or `localhost`, or you get `CRYPTO_UNAVAILABLE`.
- Call `session.end()` when you're done signing. After that, the session throws `SESSION_ENDED`.

## Monad

- **Gas is charged on the declared gas limit, not the gas actually used.** Always pass an explicit `gas`, and don't rely on inflated estimates.
- Testnet chain ID is `10143` (`monadTestnet` in viem). Mainnet is `143`. Import it from `@hive/shared`.
- **A failed broadcast still writes `deployments/monad-testnet.json`.** `vm.writeJson` runs during the pre-broadcast simulation, so a run that dies on gas still leaves (wrong) addresses on disk. Confirm `cast code <addr> --rpc-url monad_testnet` returns bytecode before trusting or committing it.
- **`forge script` takes `DEPLOYER_PRIVATE_KEY` from the process environment.** The repo has no committed `.env` (it's gitignored), so export it in the shell (`$env:DEPLOYER_PRIVATE_KEY = "0x…"`) or create `packages/contracts/.env` before deploying. Foundry resolves `.env` relative to `foundry.toml`, not the monorepo root.

## Tooling

- **Clone with submodules:** `git clone --recurse-submodules`, or run `git submodule update --init` afterwards. Otherwise `forge build` fails because `forge-std` is missing.
- **pnpm 11 blocks dependency install scripts by default.** Allowed packages are listed under `allowBuilds` in `pnpm-workspace.yaml`. If a new dependency needs a postinstall (e.g. `esbuild`), add it there.
- `@hive/shared` is consumed from `dist/`. `pnpm dev` builds it first, but if you run a single app with `--filter`, run `pnpm --filter @hive/shared build` first.
