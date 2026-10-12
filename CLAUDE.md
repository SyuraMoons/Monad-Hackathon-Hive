@AGENTS.md

## Claude Code notes

- Verify before claiming done: `pnpm build` plus the tests of the workspaces you touched. Report failures as they are.
- Use `corepack pnpm ...` if `pnpm -v` is not 11.x. Don't `pnpm install` with a global pnpm 9 in this repo.
- Read `packages/shared/src/schema/*` before touching the bridge or the web client; that is the contract.
- Private working notes (`docs/rules.md` and friends) and `CLAUDE.local.md` are gitignored. Don't copy their content into tracked files.

## Learned in practice (12 Oct 2026)

Details are in [docs/gotchas.md](docs/gotchas.md) ("Testing the canvas", "Agents in two terminals"), [docs/feedback.md](docs/feedback.md) and [docs/manual-test-two-agents.md](docs/manual-test-two-agents.md).

- **Don't touch a dev server you didn't start.** `.env.local` here is `live`. For the mock, start another one: `NEXT_PUBLIC_HIVE_MODE=mock NEXT_DIST_DIR=.next-mock pnpm --filter @hive/web exec next dev --turbopack -p 3417`, and kill it when done. `pnpm build` rewrites `.next` under a running `next dev`; use `NEXT_DIST_DIR` for builds beside it. `next dev` edits `apps/web/tsconfig.json`: restore it before you commit.
- **You can drive the canvas yourself.** A Playwright virtual authenticator (CDP `WebAuthn.addVirtualAuthenticator`, `hasPrf: true`) completes the Mera ceremony on `localhost`, so a browser check does not need the user's passkey. Test credentials only, local host only, never the deployed site. `?mock=stress&agents=8&pace=1200` gives a busy scene.
- **A browser check counts only if you read the state first.** Our first all-topics check passed while the old edge was still active and the mock could not carry `*`. List the edges before and after, and choose a case only the thing under test can carry. If you find your own check was wrong, fix the PR description and say so in it.
- **When the user runs two agents and a read comes back empty, check identity first.** Two terminals with the same agent command are one agent. Look at the session name, `hive_whoami` and the `as` field before you suspect permissions.
- **The mock mirrors the contracts.** If you change a rule in the bridge or the permission check (here: `*` covers every topic), change `apps/web/lib/hive/mock` too, or the mock hides the bug.
- **Say what you did not check.** Put "Checked" and "Not checked" in the PR, and don't tick a roadmap item for something seen only in the mock or in tool output (the pulse on the live path is still open).
- **Branches and the working tree.** One layer per PR. If the tree has someone's unfinished work, `git stash push -u -m "<what>"` before you switch, tell them it is there, and split a file with mixed hunks instead of committing it whole. A docs PR that touches `docs/feedback.md` goes on top of the feature PR, or both will conflict on the first lines. Never merge your own PR; open it and say what still needs a person (a redeploy, a live run).
- **Don't redeploy the bridge before a demo.** Sessions and OAuth state are in memory. See "Before a demo or a recording" in [docs/deployment.md](docs/deployment.md).

