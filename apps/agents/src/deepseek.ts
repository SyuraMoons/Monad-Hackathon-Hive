import { HiveClient, HiveError } from "@hive/mcp-client";
import { HIVE_INSTRUCTIONS } from "@hive/shared";
import { createInterface } from "node:readline/promises";
import { chatCompletions, ModelError, runTurn, toFunctionTools, type ChatMessage } from "./runner.js";

// DeepSeek agent (ADR-020). The owner authorizes a deepseek agent on the canvas and passes its token here:
//   HIVE_TOKEN_DEEPSEEK=<token> HIVE_MCP_URL=<mcpUrl> pnpm --filter @hive/agents deepseek --chat
// Only the model's replies are printed. Tool results are never logged (hard rule 2).

try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url));
} catch {
  // No repo .env: the process env is enough.
}

// The Hive part is the bridge's own instructions, so this runner follows the same loop as every other client.
const SYSTEM = [
  "You are a DeepSeek agent connected to Hive, a shared memory between the user's AI agents.",
  HIVE_INSTRUCTIONS,
  "Save something with hive_write_memory only when the user asks you to remember or share it.",
  "If a tool returns nothing, no edge lets you read it. Say so; never guess what another agent knows.",
].join("\n");

function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Set ${name} (see .env.example).`);
    process.exit(1);
  }
  return value;
}

function describe(e: unknown): string {
  if (e instanceof HiveError || e instanceof ModelError) return e.message;
  return "Something went wrong talking to the bridge or the model.";
}

async function main() {
  const hive = new HiveClient({ mcpUrl: env("HIVE_MCP_URL"), agentToken: env("HIVE_TOKEN_DEEPSEEK") });
  const complete = chatCompletions({ baseUrl: env("DEEPSEEK_BASE_URL"), apiKey: env("DEEPSEEK_API_KEY"), model: env("DEEPSEEK_MODEL") });
  const messages: ChatMessage[] = [{ role: "system", content: SYSTEM }];

  try {
    const tools = toFunctionTools(await hive.listTools());
    const me = await hive.callTool("hive_whoami", {});
    if (!me.isError) console.log(`Connected to Hive as ${(JSON.parse(me.text) as { name?: string }).name ?? "this agent"}.`);

    const once = process.argv.slice(2).filter((a) => a !== "--chat").join(" ").trim();
    if (!process.argv.includes("--chat")) {
      if (!once) throw new ModelError('Pass a message, or --chat for a conversation.');
      messages.push({ role: "user", content: once });
      console.log(await runTurn({ complete, hive, tools, messages }));
      return;
    }

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    console.log("Chat with DeepSeek. An empty line or Ctrl+C ends it.");
    for (;;) {
      const line = (await rl.question("> ")).trim();
      if (!line) break;
      const before = messages.length;
      messages.push({ role: "user", content: line });
      try {
        console.log(await runTurn({ complete, hive, tools, messages }));
      } catch (e) {
        // Drop the failed turn: a tool call without its result makes the next request invalid.
        messages.length = before;
        console.error(describe(e));
        if (e instanceof HiveError && e.code === "SESSION_EXPIRED") break;
      }
    }
    rl.close();
  } catch (e) {
    console.error(describe(e));
    process.exitCode = 1;
  } finally {
    await hive.close();
  }
}

void main();
