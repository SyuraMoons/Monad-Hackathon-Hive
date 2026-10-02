# DX feedback (agent layer)

Running notes on friction with the MCP SDK, tooling and Monad, for the team feedback doc. Newest first.

## 2 Oct 2026

- **`@modelcontextprotocol/sdk` 1.31 works for a custom Streamable HTTP server on Node 22/24.** Stateless mode (`sessionIdGenerator: undefined`, `enableJsonResponse: true`) with one `McpServer` per request needs no session bookkeeping, which suits a bridge that identifies the agent from a bearer token. `registerTool` takes a zod raw shape, so the shared zod 4 schemas plug in directly. Tool results should carry `structuredContent` as well as text. Both must be JSON-safe: uint256 values (`bigint`) need converting to decimal strings first.
- **KnowledgeGraph stores `keccak256(topic)` only.** The bridge can check permissions from the hash, but can't show a readable topic list (`hive_whoami.readableTopics`) without reading `EdgeAdded` logs or Envio. Worth a topic string in the `Edge` struct or an event-backed reader.
- **`msg.sender == writer` on `MemorySlots.write`** forces every agent key to hold MON unless the bridge relays. Needs a team decision (see `docs/backend-handoff.md` §2, #4).

## 1 Oct 2026

- A global `pnpm` 9 on PATH silently ignores `packageManager: pnpm@11` and offers to wipe `node_modules`. `corepack enable pnpm` fixes it.
- `pnpm build` failed completely when `forge` was missing, even though the other workspaces were healthy. `brew install foundry` gives 1.8.3, the version the contracts use.
- Interfaces drifted from the PRD/SRS (port 4000 vs 8090, `hive_whoami` instead of `hive_register_agent`, `/health` fields, event name `Propagate`). A single "frozen interfaces" table in the repo would save a lot of cross-checking.
