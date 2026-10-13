# Deployment

Where the testnet demo runs and the settings it needs.

| Part | Host | URL |
| --- | --- | --- |
| Web (`@hive/web`) | Vercel | https://monad-hackathon-eta.vercel.app |
| Bridge (`@hive/bridge`) | Railway | https://hivebridge-production.up.railway.app |
| Indexer (`@hive/indexer`) | Envio Cloud, branch `development` | https://indexer.dev.hyperindex.xyz/5a8ecda/v1/graphql |

Check the bridge with `curl https://hivebridge-production.up.railway.app/health`.

## Bridge env (Railway)

Besides the keys in [.env.example](../.env.example):

```bash
BRIDGE_PUBLIC_URL=https://hivebridge-production.up.railway.app
BRIDGE_WEB_URL=https://monad-hackathon-eta.vercel.app
BRIDGE_CORS_ORIGINS=https://monad-hackathon-eta.vercel.app
```

`BRIDGE_PUBLIC_URL` and `BRIDGE_WEB_URL` together turn on OAuth (ADR-019). Without both, `/.well-known/oauth-protected-resource` returns 404 and a claude.ai connector can't sign in. Values have no trailing slash.

## Web env (Vercel)

```bash
NEXT_PUBLIC_HIVE_MODE=live
NEXT_PUBLIC_BRIDGE_URL=https://hivebridge-production.up.railway.app
NEXT_PUBLIC_ENVIO_URL=https://indexer.dev.hyperindex.xyz/5a8ecda/v1/graphql
```

`NEXT_PUBLIC_*` values are baked in at build time, so redeploy after changing one.

## Connecting claude.ai

Use the Vercel site, not `localhost:3000`. The connector URL in Connect → Claude.ai is the `mcpUrl` the bridge returned when the agent was authorized, so a local web app talking to a local bridge shows `http://localhost:4000/mcp`. Anthropic's servers can't reach that.

The URL to paste is `https://hivebridge-production.up.railway.app/mcp`. Passkeys are bound to the domain, so sign in on the Vercel site with a passkey made there (see [gotchas.md](gotchas.md)).

## Before a demo or a recording

- Do not redeploy the bridge, or restart it, once agents are connected. Sessions, OAuth codes and refresh tokens live in memory, so every agent has to Reconnect afterwards.
- Reconnect the agents a few minutes before you start. Agent tokens last 24 h.
- `curl https://hivebridge-production.up.railway.app/health` right before, and look at `activeSessions` after the agents connect.
- Check the Railway plan and credit in the dashboard. See the 12 Oct entry in [feedback.md](feedback.md) for what the free and Hobby plans allow.
- Keep a screen recording of one full run and a local bridge for Claude Code as the fallback. ChatGPT cannot reach a local bridge.

