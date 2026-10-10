import type { HiveClient, HiveTool } from "@hive/mcp-client";

// A tool loop over any OpenAI-compatible chat completions API (DeepSeek today, ADR-020). The model picks the tools;
// the bridge decides what it may read (hard rule 3), so nothing here checks permissions.

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type AssistantMessage = { role: "assistant"; content: string | null; tool_calls?: ToolCall[]; reasoning_content?: string | null };
export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | AssistantMessage
  | { role: "tool"; tool_call_id: string; content: string };
export type FunctionTool = { type: "function"; function: { name: string; description?: string; parameters: Record<string, unknown> } };

export type Complete = (messages: ChatMessage[], tools: FunctionTool[]) => Promise<AssistantMessage>;

export class ModelError extends Error {}

export const toFunctionTools = (tools: HiveTool[]): FunctionTool[] =>
  tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.inputSchema } }));

export type ChatApiOptions = { baseUrl: string; apiKey: string; model: string; fetch?: typeof fetch };

/** POST {baseUrl}/chat/completions. Errors carry only the status: a response body can echo memory content (hard rule 2). */
export function chatCompletions({ baseUrl, apiKey, model, fetch: doFetch = fetch }: ChatApiOptions): Complete {
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  return async (messages, tools) => {
    const res = await doFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, tools, tool_choice: "auto" }),
    });
    if (!res.ok) throw new ModelError(`The model API returned HTTP ${res.status}.`);
    const body = (await res.json().catch(() => undefined)) as { choices?: { message?: AssistantMessage }[] } | undefined;
    const message = body?.choices?.[0]?.message;
    if (!message) throw new ModelError("The model API returned no message.");
    return message;
  };
}

export type TurnOptions = {
  complete: Complete;
  hive: Pick<HiveClient, "callTool">;
  tools: FunctionTool[];
  /** The conversation so far, ending with the user's message. The turn's messages are appended to it. */
  messages: ChatMessage[];
  maxSteps?: number;
};

/**
 * Runs one user turn: calls tools until the model answers in text, and returns that answer. Assistant messages are kept
 * as returned, `reasoning_content` included: with tools, DeepSeek's thinking mode wants it back on every later request.
 */
export async function runTurn({ complete, hive, tools, messages, maxSteps = 8 }: TurnOptions): Promise<string> {
  const known = new Set(tools.map((t) => t.function.name));
  for (let step = 0; step < maxSteps; step++) {
    const reply = await complete(messages, tools);
    messages.push(reply);
    if (!reply.tool_calls?.length) return reply.content ?? "";

    for (const call of reply.tool_calls) {
      messages.push({ role: "tool", tool_call_id: call.id, content: await runTool(hive, known, call) });
    }
  }
  throw new ModelError(`Stopped after ${maxSteps} tool steps without an answer.`);
}

async function runTool(hive: Pick<HiveClient, "callTool">, known: Set<string>, call: ToolCall): Promise<string> {
  const name = call.function.name;
  if (!known.has(name)) return `Error: unknown tool ${name}.`;
  let args: unknown;
  try {
    args = JSON.parse(call.function.arguments || "{}");
  } catch {
    return "Error: the tool arguments are not valid JSON.";
  }
  if (typeof args !== "object" || args === null || Array.isArray(args)) return "Error: the tool arguments must be a JSON object.";
  const out = await hive.callTool(name, args as Record<string, unknown>);
  return out.isError ? `Error: ${out.text}` : out.text;
}
