# @hive/mcp-client

Small MCP client for the mock agents. It talks to the bridge's `POST /mcp` with an agent token, so a demo bot can write and read memory without Claude Desktop.

```ts
import { HiveClient } from "@hive/mcp-client";

const hive = new HiveClient({ mcpUrl: process.env.HIVE_MCP_URL!, agentToken: process.env.HIVE_AGENT_TOKEN! });

await hive.writeMemory({ topic: "work", content: "Launch moved to Friday" });
const { memories } = await hive.readMemory({ topic: "work" }); // [] when no edge covers it
await hive.close();
```

- `mcpUrl` and `agentToken` come from `POST /v1/agents/:id/authorize` (the owner authorizes each agent from the canvas). The token is valid for 24h and there is no refresh: authorize again.
- Ids in results are `bigint`, parsed with the `@hive/shared` schemas.
- Errors are `HiveError` with the bridge's code (`UNAUTHORIZED`, `SESSION_EXPIRED`, ...). An expired token fails before any request. A read with no permission returns an empty list, not an error.
