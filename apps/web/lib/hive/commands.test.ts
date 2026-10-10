import { describe, expect, it } from "vitest";
import { claudeCommand, claudeDesktopConfig, connectorUrl, isLocalUrl, claudeTerminalCommand, nameSlug, gptRunner, gptSnippet } from "./commands";

describe("connect commands", () => {
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

  it("keeps the model out of the GPT snippet and the token in the runner", () => {
    expect(gptSnippet("u", "tok")).toContain("process.env.OPENAI_MODEL");
    expect(gptRunner("tok")).toBe("HIVE_TOKEN_GPT=tok pnpm --filter @hive/agents gpt --chat");
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
});
