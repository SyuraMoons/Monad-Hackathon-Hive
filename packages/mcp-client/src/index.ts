import {
  HiveError,
  zErrorEnvelope,
  zReadMemoryOutput,
  zWhoamiOutput,
  zWriteMemoryOutput,
  type ReadMemoryInput,
  type ReadMemoryOutput,
  type WhoamiOutput,
  type WriteMemoryInput,
  type WriteMemoryOutput,
} from "@hive/shared";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ZodType } from "zod";

export type HiveClientOptions = {
  /** `mcpUrl` from `POST /v1/agents/:id/authorize`. */
  mcpUrl: string;
  /** `agentToken` from the same response. Identity comes from this token, never from an argument. */
  agentToken: string;
};

export type HiveTool = { name: string; description?: string; inputSchema: { type: "object"; [key: string]: unknown } };
export type HiveToolResult = { isError: boolean; text: string };

/** Seconds-since-epoch `exp` of a JWT, read without verifying it (the bridge verifies). Undefined if unreadable. */
function tokenExp(token: string): number | undefined {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
    return typeof payload.exp === "number" ? payload.exp : undefined;
  } catch {
    return undefined;
  }
}

/** Turns the bridge's `{ error: { code, message } }` envelope on a non-2xx response into a `HiveError`. */
const hiveFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  if (res.ok) return res;
  const envelope = zErrorEnvelope.safeParse(await res.clone().json().catch(() => undefined));
  if (envelope.success) throw new HiveError(envelope.data.error.code, envelope.data.error.message);
  return res;
};

export class HiveClient {
  private readonly client = new Client({ name: "hive-mcp-client", version: "0.0.0" });
  private readonly exp: number | undefined;
  private connected: Promise<void> | undefined;

  constructor(private readonly opts: HiveClientOptions) {
    this.exp = tokenExp(opts.agentToken);
  }

  private connect(): Promise<void> {
    this.connected ??= this.client.connect(
      new StreamableHTTPClientTransport(new URL(this.opts.mcpUrl), {
        fetch: hiveFetch,
        requestInit: { headers: { Authorization: `Bearer ${this.opts.agentToken}` } },
      }),
    );
    return this.connected;
  }

  private async ready(): Promise<void> {
    // Fail with a clear error instead of an opaque 401 mid-demo. The bridge has no refresh: authorize the agent again.
    if (this.exp !== undefined && this.exp <= Math.floor(Date.now() / 1000)) throw new HiveError("SESSION_EXPIRED", "Agent token expired. Authorize the agent again and use the new token.");
    await this.connect();
  }

  private async call<T>(name: string, args: Record<string, unknown>, schema: ZodType<T>): Promise<T> {
    await this.ready();
    const res = await this.client.callTool({ name, arguments: args });
    if (res.isError) throw new HiveError("INTERNAL", (res.content as { text?: string }[])[0]?.text ?? `${name} failed`);
    return schema.parse(res.structuredContent);
  }

  writeMemory(input: WriteMemoryInput): Promise<WriteMemoryOutput> {
    return this.call("hive_write_memory", input, zWriteMemoryOutput);
  }

  /** Empty `memories` when no unexpired edge covers the topic. That is the bridge's default deny, not an error. */
  readMemory(input: ReadMemoryInput = {}): Promise<ReadMemoryOutput> {
    return this.call("hive_read_memory", input, zReadMemoryOutput);
  }

  whoami(): Promise<WhoamiOutput> {
    return this.call("hive_whoami", {}, zWhoamiOutput);
  }

  /** The bridge's tools with their JSON Schema inputs, for a model that picks the tool itself. */
  async listTools(): Promise<HiveTool[]> {
    await this.ready();
    const { tools } = await this.client.listTools();
    return tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
  }

  /**
   * Calls a tool by name and returns its text, for a model-driven loop. A tool failure comes back as `isError` so the
   * model can read it; an expired token or a transport error still throws.
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<HiveToolResult> {
    await this.ready();
    const res = await this.client.callTool({ name, arguments: args });
    const text = (res.content as { type: string; text?: string }[]).flatMap((c) => (c.type === "text" && c.text !== undefined ? [c.text] : [])).join("\n");
    return { isError: res.isError === true, text };
  }

  async close(): Promise<void> {
    if (this.connected) await this.client.close();
    this.connected = undefined;
  }
}

export { HiveError } from "@hive/shared";
