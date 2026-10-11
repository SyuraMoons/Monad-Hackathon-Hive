import { z } from "zod";

// The ERC-8004 identity this browser registered for an agent (ADR-028). The registry has no lookup from a Hive agent id
// to its ERC-8004 id, so until the indexer answers that, the record lives here. It is public data: an id and a tx hash.
// localStorage can be missing or full, so every access is guarded.

/** One record per AgentRegistry deploy and owner: agent ids start again after a redeploy (ADR-021). */
const keyFor = (agentRegistry: string, owner: string) => `hive:erc8004:${agentRegistry.toLowerCase()}:${owner.toLowerCase()}`;

const zId = z.string().regex(/^(0|[1-9]\d*)$/);
const zIdentity = z.object({ erc8004Id: zId, txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) });
const zIdentities = z.record(zId, zIdentity);

/** `erc8004Id` is a decimal string: it goes through JSON. */
export type AgentIdentity = z.infer<typeof zIdentity>;

type Store = Pick<Storage, "getItem" | "setItem">;

function defaultStore(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadIdentities(agentRegistry: string, owner: string, store: Store | null = defaultStore()): Record<string, AgentIdentity> {
  try {
    const raw = store?.getItem(keyFor(agentRegistry, owner));
    const parsed = zIdentities.safeParse(raw ? JSON.parse(raw) : {});
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export function saveIdentities(agentRegistry: string, owner: string, identities: Record<string, AgentIdentity>, store: Store | null = defaultStore()): void {
  try {
    store?.setItem(keyFor(agentRegistry, owner), JSON.stringify(identities));
  } catch {
    // private mode or quota: the drawer just offers to add the identity again after a reload
  }
}
