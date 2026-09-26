# Contributing

## Branches

```
main          stable, what gets submitted
 └ development integration branch, where all PRs land
    └ feat/*, fix/*, chore/*, docs/*
```

Branch off `development` and use a prefix:

- `feat/<short-name>`: new functionality (`feat/mera-smoke-test`)
- `fix/<short-name>`: bug fixes
- `chore/<short-name>`: tooling, config, deps
- `docs/<short-name>`: docs only

Don't push directly to `main` or `development`. `development` is merged into `main` for releases and the final submission.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org):

```
feat(web): add passkey login page
fix(bridge): handle missing topic in read_memory
chore: bump viem
docs: add ADR-005
```

Scopes: `web`, `bridge`, `agents`, `contracts`, `shared`, `indexer`.

## Pull requests

1. Run `pnpm build` (and `forge test` if you touched contracts). Both must pass.
2. Keep each PR to one layer or step. Small PRs get reviewed faster.
3. Describe what changed and how you tested it. Add a screenshot or tx link for UI or onchain changes.
4. Get at least one teammate's review, then squash-merge into `development`.

## Secrets

- Never commit `.env`. It's already gitignored.
- When you add a new env var, add it to `.env.example` with no value and a short comment.
- Deployer private keys stay local. Use a dedicated testnet-only wallet.

## Docs

- Changing an architectural decision? Add an ADR to [decisions.md](decisions.md).
- Finished a build step? Tick it off in [roadmap.md](roadmap.md).
- Hit a non-obvious pitfall? Add it to [gotchas.md](gotchas.md).
