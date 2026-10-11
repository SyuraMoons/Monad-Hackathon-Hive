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
const desktopEntry = (url: string, token: string) => ({
  command: "npx",
  args: ["-y", "mcp-remote", url, "--header", "Authorization:${HIVE_AUTH}"],
  env: { HIVE_AUTH: `Bearer ${token}` },
});

export const claudeDesktopConfig = (url: string, token: string, name: string) =>
  JSON.stringify({ mcpServers: { [`hive-${nameSlug(name)}`]: desktopEntry(url, token) } }, null, 2);

/** The same `mcpServers` block for any desktop MCP client that only runs stdio servers (the DeepSeek "MCP app" tab). */
export const mcpClientConfig = claudeDesktopConfig;

/** For a client that speaks HTTP MCP directly: what to enter in its server form. */
export const mcpHttpDetails = (url: string, token: string) => [`url:    ${url}`, `header: Authorization: Bearer ${token}`].join("\n");

const tokenVar = (name: string) => `HIVE_TOKEN_${nameSlug(name).toUpperCase().replace(/-/g, "_")}`;

/**
 * Codex takes the name of a token variable, never the token itself, so the paste is two lines: set the variable, then
 * register the server. `codex mcp add` replaces an entry of the same name, so the same paste also reconnects.
 */
export const codexCommand = (url: string, token: string, name: string) =>
  [`export ${tokenVar(name)}=${token}`, `codex mcp add hive-${nameSlug(name)} --url ${url} \\`, `  --bearer-token-env-var ${tokenVar(name)}`].join("\n");

/** What `codex mcp add` writes to ~/.codex/config.toml, for a Codex too old to have `--url`. */
export const codexConfig = (url: string, name: string) =>
  [`[mcp_servers.hive-${nameSlug(name)}]`, `url = ${JSON.stringify(url)}`, `bearer_token_env_var = "${tokenVar(name)}"`].join("\n");

/**
 * One prompt to paste into an AI that has shell or file access (Claude Code, Cursor, Codex, Gemini CLI, ...). It carries the
 * url and token and tells the AI to register Hive in whichever client it is. A chat-only AI cannot run it: those use the connector.
 */
export const aiConnectPrompt = (url: string, token: string, name: string) => {
  const server = `hive-${nameSlug(name)}`;
  return [
    `Connect yourself to my Hive memory as the agent "${name}". Hive is an MCP server over HTTP:`,
    ``,
    `  url:    ${url}`,
    `  header: Authorization: Bearer ${token}`,
    ``,
    `Register it as an MCP server named "${server}" in the client you are running in, using that client's own command or config file.`,
    `If "${server}" already exists, replace it: the old entry has an expired token.`,
    `For Claude Code that is: claude mcp remove ${server} (ignore the error if it isn't there), then claude mcp add --transport http ${server} ${url} --header "Authorization: Bearer ${token}"`,
    `If the client only supports stdio servers, use: npx -y mcp-remote ${url} --header "Authorization:\${HIVE_AUTH}" with HIVE_AUTH set to "Bearer ${token}".`,
    ``,
    `Don't print the token back to me or write it anywhere except that MCP config.`,
    `When it's registered: if the hive tools are already available to you, call hive_whoami to confirm. Otherwise tell me to restart or reload your client, and stop there. I'll ask you to call hive_whoami after.`,
  ].join("\n");
};

/** The Desktop variant: the AI edits claude_desktop_config.json, setting the same entry the Desktop tab shows. */
export const aiDesktopPrompt = (url: string, token: string, name: string) => {
  const server = `hive-${nameSlug(name)}`;
  return [
    `Add my Hive memory to Claude Desktop as the agent "${name}".`,
    ``,
    `Edit claude_desktop_config.json (macOS: ~/Library/Application Support/Claude/, Windows: %APPDATA%\\Claude\\).`,
    `Create the file if it doesn't exist. Under "mcpServers", set the key "${server}" to this value (replace it if it exists) and keep every other server as it is:`,
    ``,
    JSON.stringify(desktopEntry(url, token), null, 2),
    ``,
    `Don't print the token back to me or write it anywhere else. Then tell me to quit Claude Desktop fully and open it again.`,
  ].join("\n");
};

/** The URL for claude.ai's "Add custom connector": the bridge's own /mcp, no token (Claude signs in with OAuth, ADR-019). */
export const connectorUrl = (mcpUrl: string | undefined, bridgeUrl: string | undefined) =>
  mcpUrl || (bridgeUrl ? `${bridgeUrl.replace(/\/+$/, "")}/mcp` : "");

/** Anthropic's and OpenAI's servers call the connector, so a localhost or private address can never work. */
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

// DeepSeek has no remote-MCP tool, so a local runner calls the bridge for it (ADR-020). Key and model come from .env.
export const deepseekRunner = (url: string, token: string) =>
  [`HIVE_MCP_URL=${url} \\`, `HIVE_TOKEN_DEEPSEEK=${token} \\`, `pnpm --filter @hive/agents deepseek --chat`].join("\n");

/**
 * Claude Code pointed at DeepSeek's Anthropic-compatible endpoint: no repo to clone, and Hive rides along as an MCP config.
 * The key and model stay in the user's shell, so the paste carries neither.
 */
export const deepseekClaudeCommand = (url: string, token: string, name: string) =>
  [
    `ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic \\`,
    `ANTHROPIC_AUTH_TOKEN=$DEEPSEEK_API_KEY \\`,
    `ANTHROPIC_MODEL=$DEEPSEEK_MODEL \\`,
    claudeTerminalCommand(url, token, name),
  ].join("\n");
