# Proposal: one-step connect for Claude Code and Claude Desktop

Status, 11 Oct 2026: **draft for review, nothing here is built.** Written after a first real test of the Claude Desktop connector. It is a proposal, not an ADR: once the team agrees on the open questions at the bottom, the outcome becomes an ADR.

## Why

Connecting an AI client to Hive should feel like using a skill: do it once, then it just works. Today a new user does this for Claude Code:

1. Open the Connect popup and copy a command that contains a 24h agent token.
2. Paste it in a terminal, in the right folder.
3. Restart Claude Code, because MCP servers load at session start.
4. A day later, or after a bridge restart, the token is dead. Go back to step 1.

That is a web3-shaped experience. Our target is people who have never heard of a token.

## What we found on 11 Oct

We connected Claude Desktop (chat) through the OAuth connector (ADR-019) and then tried to test sharing between two agents: `Dekstop Chat` (#20) and `terminal` (#21), with one all-topics edge `Dekstop Chat → terminal`.

**Worked.** The connector added Hive with no token pasted. `hive_whoami` answered with agent #20 and a 24h session. Six tools were listed, including `hive_search_memory`. This is the first run of ADR-019 against a real Claude client.

**Surprise.** The terminal wrote "a secret note" and Claude Desktop could read it. That should be impossible without an edge `terminal → Dekstop Chat`. It was not a permission bug. The write was recorded as `fromAgentId: 20`:

- A connector added in Claude Desktop belongs to the account, so it also shows up in every Claude Code session on that account.
- The terminal session had no local `hive` server for agent #21 at all (we have not confirmed why; most likely the `claude mcp add` was not run in that folder, or the session was not restarted). The only Hive it could see was the account connector, which is agent #20.
- So the terminal wrote as #20, and the agent #21 card kept showing "waiting for first call".

Nothing told the user which identity the AI was using. The only way to find out was to call `hive_whoami`, and a normal user would not know to do that.

The bridge behaved correctly: identity comes from the token. The problem is the client side, where one account can reach Hive by two routes with two identities.

To reproduce: connect the Desktop connector, add the local server for a second agent, run both in Claude Code, call `hive_whoami` and write a memory from the second one.

## Goals

- Connect once, no token in any command or chat.
- Survive closed terminals and restarts. Re-auth after 24h is allowed if it is one click.
- The user can always see who the AI is acting as.
- Same behaviour in Claude Code and Claude Desktop/claude.ai.

Non-goals: ChatGPT (needs the public URL path and its own flow), changing how permissions work, new auth providers (ADR-001).

## Proposal

Four small pieces, each its own PR:

1. **A Claude Code plugin `hive`** in this repo (`plugins/hive/`), installed once with `/plugin marketplace add` and `/plugin install`. It ships the MCP server config for the bridge URL with no header, so Claude Code signs in through OAuth, and a few commands:
   - `/hive:connect` checks the connection and walks through sign-in (`/mcp` → Authenticate).
   - `/hive:status` calls `hive_whoami` and prints "You are acting as: terminal (#21)".
   - `/hive:remember <topic> <text>` and `/hive:recall [topic]` wrap the write and read tools.
2. **MCP prompts on the bridge** (`registerPrompt`): `connect`, `remember`, `recall`. Claude Desktop and claude.ai can list prompts from a connector, so the same actions are available there without a plugin.
3. **The caller's identity in every tool result.** Add an `as: { agentId, name }` field to the MCP results (additive, no field removed) so the AI can tell the user who it is, and a wrong identity is visible in the first answer.
4. **Web Connect popup.** The plugin (Claude Code) and the connector (Desktop) become the main path. The token command and the JSON config stay under "Manual", because the DeepSeek runner and the mock agents still use tokens.

Alternatives we looked at:

| Option | Gain | Cost |
| --- | --- | --- |
| Keep the token command | nothing to build | everything above stays |
| One static OAuth command (`claude mcp add --transport http hive <url>`) | no token, one line | still a paste, still no commands, still one folder at a time |
| Plugin + prompts + identity (this proposal) | install once, `/` commands, visible identity | a plugin to maintain |

## What we will say in the UI and docs

- The Desktop connector: tested once on 11 Oct with a real client, one agent, no failure beyond the identity issue above.
- The plugin and the prompts: **planned**. We have not checked that a plugin can ship an HTTP MCP server that uses OAuth, or how prompts show up in Claude Desktop. That is the first thing the plugin PR proves.
- Limits that stay: one connector is one agent; sign in again after 24h or a bridge restart (OAuth codes and refresh tokens are in memory, ADR-019).

## Open questions

1. **Plugin location.** Inside this monorepo (`plugins/hive/`, our recommendation) or a separate repo?
2. **The `as` field.** It adds a field to the MCP result shapes in `@hive/shared`. Is that fine for the web client and the mock agents, or do they validate strictly?
3. **Two routes, one account.** Should the plugin disable or warn about the account connector when the local server is present? Or do we only document "one route per client"?
4. **Agent choice.** One connector is one agent. Should the OAuth consent page remember the last agent, or ask every time?
5. **Persistent OAuth state.** Is it worth keeping codes and refresh tokens somewhere other than memory before the demo, so a Railway redeploy does not sign everyone out?
6. **Demo.** Which path do we show on stage: the Desktop connector, the plugin, or both?

## Rollout

1. Plugin, with a recorded run on a clean machine.
2. Bridge: prompts and the `as` field, with tests in the style of `test/mcp.test.ts`.
3. Web: Connect popup copy, and a line telling users to pick "Always allow" for the read tools.

Each PR ships with tests and updates `docs/feedback.md` with what we hit.
