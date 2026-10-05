import { describe, expect, it } from "vitest";
import { claudeCommand, gptRunner, gptSnippet } from "./commands";

describe("connect commands", () => {
  it("puts the url and token in the Claude Code command", () => {
    const cmd = claudeCommand("http://localhost:4000/mcp", "tok");
    expect(cmd).toContain("claude mcp add --transport http hive");
    expect(cmd).toContain("http://localhost:4000/mcp");
    expect(cmd).toContain('Authorization: Bearer tok"');
  });

  it("keeps the model out of the GPT snippet and the token in the runner", () => {
    expect(gptSnippet("u", "tok")).toContain("process.env.OPENAI_MODEL");
    expect(gptRunner("tok")).toBe("HIVE_TOKEN_GPT=tok pnpm --filter @hive/agents gpt --chat");
  });
});
