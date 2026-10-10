import { z } from "zod";

// The tokens the bridge issued to this owner's agents, kept in sessionStorage so a reload of the tab does not lose the
// commands the user already has. They end with the tab and are dropped at expiry. localStorage is not used: these are
// bearer secrets for 24 h (ADR-011).

const keyFor = (owner: string) => `hive:agent-tokens:${owner.toLowerCase()}`;

const zTokens = z.record(z.string().regex(/^(0|[1-9]\d*)$/), z.object({ agentToken: z.string().min(1), mcpUrl: z.string().min(1), expiresAt: z.number().int() }));
export type StoredTokens = z.infer<typeof zTokens>;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStore(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** The saved tokens that have not expired. */
export function loadAgentTokens(owner: string, nowS: number, store: Store | null = defaultStore()): StoredTokens {
  try {
    const raw = store?.getItem(keyFor(owner));
    const parsed = zTokens.safeParse(raw ? JSON.parse(raw) : {});
    if (!parsed.success) return {};
    return Object.fromEntries(Object.entries(parsed.data).filter(([, t]) => t.expiresAt > nowS));
  } catch {
    return {};
  }
}

export function saveAgentTokens(owner: string, tokens: StoredTokens, store: Store | null = defaultStore()): void {
  try {
    store?.setItem(keyFor(owner), JSON.stringify(tokens));
  } catch {
    // private mode or quota: the commands just won't survive a reload
  }
}

export function clearAgentTokens(owner: string, store: Store | null = defaultStore()): void {
  try {
    store?.removeItem(keyFor(owner));
  } catch {
    // nothing to clear
  }
}
