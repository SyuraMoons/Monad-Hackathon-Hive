import {
  type Address,
  HiveError,
  zAgentsResponse,
  zAuthChallengeResponse,
  zAuthVerifyResponse,
  zAuthorizeResponse,
  zErrorEnvelope,
  zHealthResponse,
  zOAuthApproveResponse,
} from "@hive/shared";
import type { HiveClient, Session } from "../types";
import { createEventStream } from "./events";

// The bridge's HTTP routes (rules §5.1). Every response is checked against the shared zod schema,
// so a bridge that drifts from the contract fails loudly here instead of deep inside a screen.

const TIMEOUT_MS = 10_000;

function baseUrl(): string {
  const url = process.env.NEXT_PUBLIC_BRIDGE_URL;
  if (!url) throw new HiveError("INTERNAL", "NEXT_PUBLIC_BRIDGE_URL is not set, so the app doesn't know where the Hive bridge is.");
  return url.replace(/\/+$/, "");
}

type Parser<T> = { parse(data: unknown): T };

async function call<T>(method: string, path: string, opts: { body?: unknown; token?: string; schema?: Parser<T> } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(baseUrl() + path, {
      method,
      headers: {
        ...(opts.body !== undefined && { "Content-Type": "application/json" }),
        ...(opts.token && { Authorization: `Bearer ${opts.token}` }),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof HiveError) throw e;
    throw new HiveError("INTERNAL", "The Hive bridge is unreachable.");
  }

  if (!res.ok) {
    const envelope = zErrorEnvelope.safeParse(await res.json().catch(() => null));
    if (envelope.success) throw new HiveError(envelope.data.error.code, envelope.data.error.message);
    throw new HiveError(res.status === 401 ? "UNAUTHORIZED" : "INTERNAL", `The Hive bridge answered ${res.status}.`);
  }
  if (!opts.schema) return undefined as T;
  try {
    return opts.schema.parse(await res.json());
  } catch {
    throw new HiveError("INTERNAL", `The Hive bridge sent an unexpected response for ${method} ${path}.`);
  }
}

/** `status`, `auth` and `agents` of the live client. The user token lives in this closure; the session store saves it for a reload (ADR-011). */
export function createBridgeApi(): Pick<HiveClient, "auth" | "agents" | "oauth"> & {
  health: HiveClient["status"]["health"];
  events: HiveClient["events"];
  /** Puts a saved session back after a reload. */
  resume(session: Session): void;
  /** The signed-in owner, known before the passkey is asked again. */
  owner(): Address | undefined;
} {
  let userToken: string | undefined;
  let owner: Address | undefined;
  const token = () => {
    if (!userToken) throw new HiveError("UNAUTHORIZED", "Sign in first.");
    return userToken;
  };

  const agents: HiveClient["agents"] = {
    list: () => call("GET", "/v1/agents", { token: token(), schema: zAgentsResponse }),
    authorize: (agentId, body) => call("POST", `/v1/agents/${agentId}/authorize`, { token: token(), body, schema: zAuthorizeResponse }),
    disconnect: (agentId) => call("DELETE", `/v1/agents/${agentId}/session`, { token: token() }),
  };

  const oauth: HiveClient["oauth"] = {
    // agentId is a bigint in TS and a decimal string on the wire.
    approve: ({ request, decision, agentId }) =>
      call("POST", "/v1/oauth/approve", { token: token(), body: { request, decision, agentId: agentId?.toString() }, schema: zOAuthApproveResponse }),
  };

  return {
    health: () => call("GET", "/health", { schema: zHealthResponse }),
    resume(session) {
      userToken = session.userToken;
      owner = session.owner;
    },
    owner: () => owner,
    oauth,
    events: { subscribe: createEventStream({ baseUrl, token: () => userToken }) },
    auth: {
      challenge: (owner) => call("POST", "/v1/auth/challenge", { body: { owner }, schema: zAuthChallengeResponse }),
      async verify(body) {
        const res = await call("POST", "/v1/auth/verify", { body, schema: zAuthVerifyResponse });
        userToken = res.userToken;
        owner = body.owner;
        return { owner: body.owner, ...res };
      },
      // Sign out ends every agent's bridge session, so scoped keys leave the bridge's memory (rules §5.1).
      async signOut(session) {
        userToken = session.userToken;
        try {
          const list = await agents.list();
          await Promise.allSettled(list.filter((a) => a.connected).map((a) => agents.disconnect(a.agentId)));
        } finally {
          userToken = undefined;
          owner = undefined;
        }
      },
    },
    agents,
  };
}
