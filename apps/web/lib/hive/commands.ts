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
