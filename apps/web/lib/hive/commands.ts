// What the user pastes to connect an agent. Shared by the Connect page and the canvas drawer.

export const claudeCommand = (url: string, token: string) =>
  [`claude mcp add --transport http hive \\`, `  ${url} \\`, `  --header "Authorization: Bearer ${token}"`].join("\n");

// One terminal is one agent: the config is passed on the command line, so nothing is saved in the folder.
const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** The agent name as a session label: lowercase letters, digits and dashes only. */
export const nameSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "agent";

export const claudeTerminalCommand = (url: string, token: string, name: string) => {
  const config = { mcpServers: { hive: { type: "http", url, headers: { Authorization: `Bearer ${token}` } } } };
  return `claude -n hive-${nameSlug(name)} --mcp-config ${shellQuote(JSON.stringify(config))}`;
};

/**
 * Claude Desktop reaches the bridge through `mcp-remote` (a local stdio proxy). The token sits in `env` because Desktop
 * mangles a space inside `args`, so the header value is `Authorization:${HIVE_AUTH}` with no space after the colon.
 */
export const claudeDesktopConfig = (url: string, token: string, name: string) =>
  JSON.stringify(
    {
      mcpServers: {
        [`hive-${nameSlug(name)}`]: {
          command: "npx",
          args: ["-y", "mcp-remote", url, "--header", "Authorization:${HIVE_AUTH}"],
          env: { HIVE_AUTH: `Bearer ${token}` },
        },
      },
    },
    null,
    2,
  );

/**
 * One prompt to paste into an AI that has shell or file access (Claude Code, Cursor, Codex, Gemini CLI, ...). It carries the
 * url and token and tells the AI to register Hive in whichever client it is. A chat-only AI cannot run it: those use the connector.
 */
export const aiConnectPrompt = (url: string, token: string, name: string) =>
  [
    `Connect yourself to my Hive memory as the agent "${name}". Hive is an MCP server over HTTP:`,
    ``,
    `  url:    ${url}`,
    `  header: Authorization: Bearer ${token}`,
    ``,
    `Register it as an MCP server named "${`hive-${nameSlug(name)}`}" in the client you are running in, using that client's own command or config file.`,
    `For Claude Code that is: claude mcp add --transport http hive-${nameSlug(name)} ${url} --header "Authorization: Bearer ${token}"`,
    `If the client only supports stdio servers, use: npx -y mcp-remote ${url} --header "Authorization:\${HIVE_AUTH}" with HIVE_AUTH set to "Bearer ${token}".`,
    ``,
    `Don't print the token back to me or write it anywhere except that MCP config. When it's registered, tell me to restart or reload if your client needs it, then call hive_whoami to confirm.`,
  ].join("\n");

/** The Desktop variant: the AI edits claude_desktop_config.json, merging the same entry the Desktop tab shows. */
export const aiDesktopPrompt = (url: string, token: string, name: string) =>
  [
    `Add my Hive memory to Claude Desktop as the agent "${name}".`,
    ``,
    `Edit claude_desktop_config.json (macOS: ~/Library/Application Support/Claude/, Windows: %APPDATA%\\Claude\\).`,
    `Create the file if it doesn't exist. Merge this entry into "mcpServers" and keep every other server as it is:`,
    ``,
    claudeDesktopConfig(url, token, name),
    ``,
    `Don't print the token back to me or write it anywhere else. Then tell me to quit Claude Desktop fully and open it again.`,
  ].join("\n");

/** The URL for claude.ai's "Add custom connector": the bridge's own /mcp, no token (Claude signs in with OAuth, ADR-019). */
export const connectorUrl = (mcpUrl: string | undefined, bridgeUrl: string | undefined) =>
  mcpUrl || (bridgeUrl ? `${bridgeUrl.replace(/\/+$/, "")}/mcp` : "");

/** Anthropic's servers call the connector, so a localhost or private address can never work. */
export const isLocalUrl = (url: string) => /^https?:\/\/(localhost|127\.|10\.|192\.168\.|\[::1\])/i.test(url);

// OpenAI Responses API with a remote MCP tool (rules O7 option b, design D11). The model comes from the env, never hardcoded.
export const gptSnippet = (url: string, token: string) =>
  [
    `await openai.responses.create({`,
    `  model: process.env.OPENAI_MODEL,`,
    `  tools: [{ type: "mcp", server_label: "hive",`,
    `    server_url: "${url}",`,
    `    authorization: "${token}",`,
    `    require_approval: "never" }],`,
    `  input: "What do you remember about my work?",`,
    `});`,
  ].join("\n");

export const gptRunner = (token: string) => `HIVE_TOKEN_GPT=${token} pnpm --filter @hive/agents gpt --chat`;

// DeepSeek has no remote-MCP tool, so a local runner calls the bridge for it (ADR-020). Key and model come from .env.
export const deepseekRunner = (url: string, token: string) =>
  [`HIVE_MCP_URL=${url} \\`, `HIVE_TOKEN_DEEPSEEK=${token} \\`, `pnpm --filter @hive/agents deepseek --chat`].join("\n");
