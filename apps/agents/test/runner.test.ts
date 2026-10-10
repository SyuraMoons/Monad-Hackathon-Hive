import { describe, expect, it, vi } from "vitest";
import { chatCompletions, ModelError, runTurn, toFunctionTools, type AssistantMessage, type ChatMessage, type Complete } from "../src/runner.js";

const tools = toFunctionTools([
  { name: "hive_list_memory", description: "list", inputSchema: { type: "object", properties: {} } },
  { name: "hive_read_memory", description: "read", inputSchema: { type: "object", properties: { slotIds: { type: "array" } } } },
]);

const call = (id: string, name: string, args: string): AssistantMessage => ({ role: "assistant", content: null, tool_calls: [{ id, type: "function", function: { name, arguments: args } }] });
const say = (content: string): AssistantMessage => ({ role: "assistant", content });

/** A model that replies from a script, and a record of what it was sent. */
function scripted(...replies: AssistantMessage[]) {
  const seen: ChatMessage[][] = [];
  const complete: Complete = async (messages) => {
    seen.push(structuredClone(messages));
    const next = replies.shift();
    if (!next) throw new Error("script ran out");
    return structuredClone(next);
  };
  return { complete, seen };
}

const start = (text: string): ChatMessage[] => [{ role: "system", content: "sys" }, { role: "user", content: text }];

describe("toFunctionTools", () => {
  it("maps each MCP tool to a function tool with its JSON Schema", () => {
    expect(tools[1]).toEqual({ type: "function", function: { name: "hive_read_memory", description: "read", parameters: { type: "object", properties: { slotIds: { type: "array" } } } } });
  });
});

describe("runTurn", () => {
  it("runs the model's tool calls through the bridge and returns its answer", async () => {
    const { complete, seen } = scripted(call("c1", "hive_list_memory", "{}"), call("c2", "hive_read_memory", '{"slotIds":["7"]}'), say("The launch moved to Friday."));
    const callTool = vi.fn(async (name: string) => ({ isError: false, text: name === "hive_list_memory" ? '{"memories":[{"slotId":"7"}]}' : '{"memories":[{"content":"Launch moved to Friday"}]}' }));
    const messages = start("what's new?");

    expect(await runTurn({ complete, hive: { callTool }, tools, messages })).toBe("The launch moved to Friday.");
    expect(callTool.mock.calls).toEqual([["hive_list_memory", {}], ["hive_read_memory", { slotIds: ["7"] }]]);
    expect(seen[1]!.at(-1)).toEqual({ role: "tool", tool_call_id: "c1", content: '{"memories":[{"slotId":"7"}]}' });
    expect(messages.at(-1)).toEqual(say("The launch moved to Friday."));
  });

  it("hands a tool failure, an unknown tool and bad arguments back to the model instead of calling the bridge", async () => {
    const { complete, seen } = scripted(
      { role: "assistant", content: null, tool_calls: [
        { id: "a", type: "function", function: { name: "hive_read_memory", arguments: "{}" } },
        { id: "b", type: "function", function: { name: "rm_rf", arguments: "{}" } },
        { id: "c", type: "function", function: { name: "hive_list_memory", arguments: "{not json" } },
        { id: "d", type: "function", function: { name: "hive_list_memory", arguments: "[1]" } },
      ] },
      say("Nothing I can read."),
    );
    const callTool = vi.fn(async () => ({ isError: true, text: "Invalid input." }));

    await runTurn({ complete, hive: { callTool }, tools, messages: start("hi") });
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(seen[1]!.slice(-4).map((m) => m.content)).toEqual([
      "Error: Invalid input.",
      "Error: unknown tool rm_rf.",
      "Error: the tool arguments are not valid JSON.",
      "Error: the tool arguments must be a JSON object.",
    ]);
  });

  it("stops after maxSteps tool rounds", async () => {
    const { complete } = scripted(call("1", "hive_list_memory", "{}"), call("2", "hive_list_memory", "{}"), call("3", "hive_list_memory", "{}"));
    const callTool = vi.fn(async () => ({ isError: false, text: "{}" }));
    await expect(runTurn({ complete, hive: { callTool }, tools, messages: start("loop"), maxSteps: 2 })).rejects.toBeInstanceOf(ModelError);
    expect(callTool).toHaveBeenCalledTimes(2);
  });

  it("sends reasoning back within a turn and drops it once the turn ends", async () => {
    const { complete, seen } = scripted({ ...call("c1", "hive_list_memory", "{}"), reasoning_content: "think" }, { ...say("done"), reasoning_content: "more" });
    const messages = start("hi");
    await runTurn({ complete, hive: { callTool: async () => ({ isError: false, text: "{}" }) }, tools, messages });
    expect(seen[1]!.find((m) => m.role === "assistant")).toMatchObject({ reasoning_content: "think" });
    expect(messages.some((m) => "reasoning_content" in m)).toBe(false);
  });

  it("lets a bridge error such as an expired token reach the caller", async () => {
    const { complete } = scripted(call("c1", "hive_list_memory", "{}"));
    const expired = Object.assign(new Error("Agent token expired."), { code: "SESSION_EXPIRED" });
    await expect(runTurn({ complete, hive: { callTool: async () => Promise.reject(expired) }, tools, messages: start("hi") })).rejects.toBe(expired);
  });
});

describe("chatCompletions", () => {
  it("posts the model, messages and tools with the API key", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: say("hi") }] })));
    const complete = chatCompletions({ baseUrl: "https://api.example.test/", apiKey: "k", model: "m", fetch });

    expect(await complete(start("hi"), tools)).toEqual(say("hi"));
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.test/chat/completions");
    expect(init.headers).toMatchObject({ Authorization: "Bearer k" });
    expect(JSON.parse(init.body as string)).toMatchObject({ model: "m", tools, tool_choice: "auto" });
  });

  it("reports only the status on an HTTP error, never the body", async () => {
    const fetch = vi.fn(async () => new Response("secret memory text echoed back", { status: 400 }));
    const err = await chatCompletions({ baseUrl: "https://api.example.test", apiKey: "k", model: "m", fetch })(start("hi"), tools).catch((e: Error) => e);
    expect(err).toBeInstanceOf(ModelError);
    expect(err.message).toBe("The model API returned HTTP 400.");
  });

  it("fails clearly when the response has no message", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [] })));
    await expect(chatCompletions({ baseUrl: "https://x.test", apiKey: "k", model: "m", fetch })(start("hi"), tools)).rejects.toBeInstanceOf(ModelError);
  });
});
