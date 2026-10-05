// What the user pastes to connect an agent. Shared by the Connect page and the canvas drawer.

export const claudeCommand = (url: string, token: string) =>
  [`claude mcp add --transport http hive \\`, `  ${url} \\`, `  --header "Authorization: Bearer ${token}"`].join("\n");

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
