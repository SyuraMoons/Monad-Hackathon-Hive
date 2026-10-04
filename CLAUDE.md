@AGENTS.md

## Claude Code notes

- Verify before claiming done: `pnpm build` plus the tests of the workspaces you touched. Report failures as they are.
- Use `corepack pnpm ...` if `pnpm -v` is not 11.x. Don't `pnpm install` with a global pnpm 9 in this repo.
- Read `packages/shared/src/schema/*` before touching the bridge or the web client; that is the contract.
- Private working notes (`docs/rules.md` and friends) and `CLAUDE.local.md` are gitignored. Don't copy their content into tracked files.
