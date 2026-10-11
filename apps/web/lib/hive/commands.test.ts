import { describe, expect, it } from "vitest";
import { aiConnectPrompt, aiDesktopPrompt, claudeCommand, claudeDesktopConfig, claudeTerminalCommand, connectorUrl, deepseekClaudeCommand, deepseekRunner, isLocalUrl, nameSlug, gptSnippet, codexCommand, codexConfig, mcpClientConfig, mcpHttpDetails } from "./commands";

describe("connect commands", () => {
  it("passes the url and token to the DeepSeek runner and nothing else", () => {
    expect(deepseekRunner("http://localhost:4000/mcp", "tok")).toBe(
      "HIVE_MCP_URL=http://localhost:4000/mcp \\\nHIVE_TOKEN_DEEPSEEK=tok \\\npnpm --filter @hive/agents deepseek --chat",
    );
  });

  it("runs Claude Code on DeepSeek with the key and model left in the shell", () => {
    const cmd = deepseekClaudeCommand("http://localhost:4000/mcp", "tok", "DeepSeek · FE");
    expect(cmd.split("\n").slice(0, 3)).toEqual([
      "ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic \\",
      "ANTHROPIC_AUTH_TOKEN=$DEEPSEEK_API_KEY \\",
      "ANTHROPIC_MODEL=$DEEPSEEK_MODEL \\",
    ]);
    expect(cmd.endsWith(claudeTerminalCommand("http://localhost:4000/mcp", "tok", "DeepSeek · FE"))).toBe(true);
  });

  it("puts the url and token in the Claude Code command", () => {
    const cmd = claudeCommand("http://localhost:4000/mcp", "tok");
    expect(cmd).toContain("claude mcp add --transport http hive");
    expect(cmd).toContain("http://localhost:4000/mcp");
    expect(cmd).toContain('Authorization: Bearer tok"');
  });

  it("builds a per-terminal command that carries the config and saves nothing", () => {
    const cmd = claudeTerminalCommand("http://localhost:4000/mcp", "tok", "Claude · FE");
    expect(cmd.startsWith("claude -n hive-claude-fe --mcp-config '")).toBe(true);
    const json = JSON.parse(cmd.slice(cmd.indexOf("'") + 1, -1));
    expect(json.mcpServers.hive).toEqual({ type: "http", url: "http://localhost:4000/mcp", headers: { Authorization: "Bearer tok" } });
    expect(cmd).not.toContain("mcp add");
  });

  it("keeps quotes and spaces in a name out of the shell", () => {
    expect(nameSlug(`x'; rm -rf ~ #"`)).toBe("x-rm-rf");
    expect(nameSlug("   ")).toBe("agent");
    expect(claudeTerminalCommand("u", "t", `a'b`)).toContain("hive-a-b ");
  });

  it("escapes a single quote inside the config", () => {
    expect(claudeTerminalCommand("http://h/x'y", "t", "a")).toContain(`x'\\''y`);
  });

  it("keeps the model out of the GPT snippet and sends the bare token, which the Responses API treats as the OAuth token", () => {
    const snippet = gptSnippet("https://b.example/mcp", "tok");
    expect(snippet).toContain("process.env.OPENAI_MODEL");
    expect(snippet).toContain('server_url: "https://b.example/mcp"');
    expect(snippet).toContain('authorization: "tok"');
  });

  it("connects Codex with one paste that replaces the old entry and appends a static header", () => {
    expect(codexCommand("https://b.example/mcp", "tok", "GPT · FE")).toBe(
      [
        "codex mcp remove hive-gpt-fe >/dev/null 2>&1",
        "cat >> ~/.codex/config.toml <<'EOF'",
        "",
        "[mcp_servers.hive-gpt-fe]",
        'url = "https://b.example/mcp"',
        'http_headers = { Authorization = "Bearer tok" }',
        "EOF",
      ].join("\n"),
    );
  });

  it("gives the Codex config block with no token variable, for editing the file by hand", () => {
    const toml = codexConfig("https://b.example/mcp", "tok", "GPT · FE");
    expect(toml).toBe('[mcp_servers.hive-gpt-fe]\nurl = "https://b.example/mcp"\nhttp_headers = { Authorization = "Bearer tok" }');
    expect(toml).not.toContain("bearer_token_env_var");
  });

  it("gives a generic MCP app the stdio config and the plain HTTP details", () => {
    expect(mcpClientConfig("https://b.example/mcp", "tok", "DeepSeek")).toBe(claudeDesktopConfig("https://b.example/mcp", "tok", "DeepSeek"));
    expect(mcpHttpDetails("https://b.example/mcp", "tok")).toBe("url:    https://b.example/mcp\nheader: Authorization: Bearer tok");
  });

  it("builds a Claude Desktop config that keeps the token in env, not in args", () => {
    const text = claudeDesktopConfig("https://bridge.example/mcp", "tok", "Claude · FE");
    const json = JSON.parse(text);
    expect(Object.keys(json.mcpServers)).toEqual(["hive-claude-fe"]);
    const server = json.mcpServers["hive-claude-fe"];
    expect(server.command).toBe("npx");
    expect(server.args).toEqual(["-y", "mcp-remote", "https://bridge.example/mcp", "--header", "Authorization:${HIVE_AUTH}"]);
    expect(server.env).toEqual({ HIVE_AUTH: "Bearer tok" });
    expect(JSON.stringify(server.args)).not.toContain("tok");
  });

  it("gives claude.ai the bridge's /mcp url without a token, and flags addresses Anthropic cannot reach", () => {
    expect(connectorUrl("https://b.example/mcp", "http://other")).toBe("https://b.example/mcp");
    expect(connectorUrl(undefined, "https://b.example/")).toBe("https://b.example/mcp");
    expect(connectorUrl(undefined, undefined)).toBe("");
    expect(isLocalUrl("http://localhost:4000/mcp")).toBe(true);
    expect(isLocalUrl("http://192.168.1.4:4000/mcp")).toBe(true);
    expect(isLocalUrl("https://hivebridge-production.up.railway.app/mcp")).toBe(false);
  });

  it("writes a paste-to-AI prompt with the url, token and a stdio fallback", () => {
    const p = aiConnectPrompt("http://localhost:4000/mcp", "tok", "Claude · FE");
    expect(p).toContain("http://localhost:4000/mcp");
    expect(p).toContain("Authorization: Bearer tok");
    expect(p).toContain("hive-claude-fe");
    expect(p).toContain("mcp-remote");
  });

  it("replaces an existing entry and only calls hive_whoami once the tools are loaded", () => {
    const p = aiConnectPrompt("http://localhost:4000/mcp", "tok", "Claude · FE");
    expect(p).toContain("claude mcp remove hive-claude-fe");
    expect(p).toContain("already available");
  });

  it("asks the AI to merge the Desktop entry into claude_desktop_config.json", () => {
    const p = aiDesktopPrompt("https://b.example/mcp", "tok", "Claude · FE");
    expect(p).toContain("claude_desktop_config.json");
    expect(p).toContain('"hive-claude-fe"');
    expect(p).toContain('"HIVE_AUTH": "Bearer tok"');
    expect(p).toContain('"command": "npx"');
    expect(p).not.toContain('"mcpServers": {');
    expect(p).toContain("Library/Application Support/Claude");
  });
});
