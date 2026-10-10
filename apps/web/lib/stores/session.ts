"use client";

import { authMessage, HiveError, type Address, type AgentId, type AgentType } from "@hive/shared";
import { bytesToHex, zeroAddress } from "viem";
import { privateKeyToAddress } from "viem/accounts";
import { create } from "zustand";
import { getHiveClient, HIVE_MODE } from "@/lib/hive/client";
import { checkAgentName } from "@/lib/hive/agentName";
import { clearAgentTokens, loadAgentTokens, saveAgentTokens } from "@/lib/hive/agentTokens";
import { clearSavedSession, loadSavedSession, saveSession } from "@/lib/hive/savedSession";
import type { HiveMode } from "@/lib/hive/types";
import { useGraph, type AgentNode } from "./graph";
import type { LiveHiveClient } from "@/lib/hive/live";
import type { MockHiveClient } from "@/lib/hive/mock";
import { getPasskeyService, PasskeyError, type HiveKeys, type PasskeyErrorCode } from "@/lib/passkey";

/** Login screen states (Figma 05 · Login): 1 signed-out · 2 waiting · 3 verified · 4 error. */
type Status = "signed-out" | "waiting" | "verified" | "signed-in" | "error";

export type LoginError = { code: PasskeyErrorCode | "BRIDGE"; message: string };

type SessionState = {
  status: Status;
  mode: HiveMode;
  owner?: Address;
  /** Saved in localStorage for its 24 h life, so a reload keeps the user signed in (ADR-011). */
  userToken?: string;
  expiresAt?: number;
  /** Derived from the passkey on this device. Memory only: never persisted, gone on reload. After a reload it is undefined until `unlock()`. */
  keys?: HiveKeys;
  /** True once the first restore attempt has finished, so the app doesn't send a reloaded tab to /login too early. */
  restored: boolean;
  /** The passkey that signed in, so the recovery phrase is revealed by that passkey only. */
  credentialId?: string;
  /** Which key rows on Login 3 are done. */
  progress: { owner: boolean; encryption: boolean; scope: boolean };
  /** Where to go after Login 3: /connect when the owner has no agent yet (rules §6), the canvas otherwise. */
  destination?: "/connect" | "/canvas";
  error?: LoginError;
  /** True after the user chose Sign out, so the app sends them home rather than back to /login. */
  signedOutOnPurpose: boolean;
  /** Per agent type on the Connect page. Tokens are bearer secrets: memory only. */
  connections: Partial<Record<AgentType, Connection>>;
  /** Tokens issued to this owner's agents, by agent id, so a command can be shown again after a Reconnect or a reload. Kept in sessionStorage. */
  authorizations: Record<string, Authorization>;
  /** Brings back the session saved before a reload (live mode). Runs once. Keys stay locked until `unlock()`. */
  restore(): Promise<void>;
  /** Derives the keys again from the signed-in passkey (one touch). Resolves to the keys already held when there are some. */
  unlock(): Promise<HiveKeys>;
  signIn(options?: { create?: boolean }): Promise<void>;
  /** Connect page: register the agent if needed (owner userOp), then authorize it with the bridge (rules O1, §5.1). */
  connectAgent(agentType: AgentType, name: string): Promise<void>;
  /** Registers one more agent (an owner transaction that costs gas), then authorizes it. Resolves to its id. Throws a readable message. */
  createAgent(name: string, agentType: AgentType, onStep?: (step: CreateStep) => void): Promise<AgentId>;
  /** Canvas Reconnect: gives the bridge the agent's keys again (one passkey touch when locked). A token under 24h old works again. Finishes a registration that stopped before the writer key was set. Throws a readable message. */
  authorizeAgent(agentId: AgentId): Promise<void>;
  /** Ends the agent's bridge session: its keys leave the bridge and its token stops working. */
  disconnectAgent(agentId: AgentId): Promise<void>;
  /** Asks the signed-in passkey again and returns the 24-word recovery phrase. Never stored. */
  revealRecoveryPhrase(): Promise<string>;
  cancel(): void;
  reset(): void;
  signOut(): Promise<void>;
};

/** What `createAgent` is doing, for the form's progress text. */
export type CreateStep = "registering" | "loading" | "authorizing";

export type Connection =
  | { phase: "registering" | "authorizing" }
  | { phase: "ready"; agentId: AgentId; agentToken: string; mcpUrl: string; expiresAt: number }
  | { phase: "error"; message: string };

/** The token the bridge issued for one agent, by agent id. Memory only: it is a bearer secret. */
export type Authorization = { agentToken: string; mcpUrl: string; expiresAt: number };

let inFlight: AbortController | null = null;
let restoring: Promise<void> | null = null;
let unlocking: Promise<HiveKeys> | null = null;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;

const initial = { status: "signed-out" as Status, progress: { owner: false, encryption: false, scope: false }, connections: {}, authorizations: {}, signedOutOnPurpose: false };

const nowS = () => Math.floor(Date.now() / 1000);

/** What every signed-out state clears. */
const signedOut = { owner: undefined, userToken: undefined, expiresAt: undefined, keys: undefined, credentialId: undefined, destination: undefined, error: undefined };

function clearSigner() {
  void getHiveClient().then((c) => c.mode === "live" && (c as LiveHiveClient).useSigner(null));
}

const MAX_AGENT_INDEX = 64;

/** The key index n whose m/44'/60'/0'/0/{n} address is `agentKey` (rules §4: recoverable by re-deriving). */
function findAgentIndex(keys: HiveKeys, agentKey: string): number | null {
  for (let n = 1; n <= MAX_AGENT_INDEX; n++) {
    if (privateKeyToAddress(keys.agentPrivateKey(n)).toLowerCase() === agentKey.toLowerCase()) return n;
  }
  return null;
}

/** The next unused index: the first n whose address isn't already one of the owner's agents. */
function nextAgentIndex(keys: HiveKeys, taken: string[]): number {
  const used = new Set(taken.map((k) => k.toLowerCase()));
  for (let n = 1; n <= MAX_AGENT_INDEX; n++) {
    if (!used.has(privateKeyToAddress(keys.agentPrivateKey(n)).toLowerCase())) return n;
  }
  throw new Error("No free agent key index");
}

/** Saves the tokens for a reload of this tab. */
function persistTokens() {
  const { owner, authorizations } = useSession.getState();
  if (owner) saveAgentTokens(owner, authorizations);
}

/** Hands the bridge one agent's keys and remembers the token it answers with. */
async function authorizeWithKeys(keys: HiveKeys, agent: { agentId: AgentId; agentKey: string; name: string }) {
  const n = findAgentIndex(keys, agent.agentKey);
  if (n === null) throw new Error(`${agent.name} was registered with a different passkey, so this one can't authorize it.`);
  const res = await (await getHiveClient()).agents.authorize(agent.agentId, { agentPrivateKey: keys.agentPrivateKey(n), encryptionKey: bytesToHex(keys.encryptionKey) });
  const { authorizations } = useSession.getState();
  useSession.setState({ authorizations: { ...authorizations, [agent.agentId.toString()]: { agentToken: res.agentToken, mcpUrl: res.mcpUrl, expiresAt: res.expiresAt } } });
  persistTokens();
  return res;
}

/**
 * Registering is two transactions. If it stopped between them the agent exists with no writer key: send the second one
 * (registerAndBind reuses the unbound agent of the same name and type) and read the graph again.
 */
async function bindIfNeeded<T extends { agentId: AgentId; agentKey: string; name: string; agentType: AgentType }>(keys: HiveKeys, owner: Address, agent: T): Promise<AgentNode> {
  const graph = useGraph.getState();
  if (agent.agentKey !== zeroAddress) return agent as unknown as AgentNode;
  const n = nextAgentIndex(keys, Object.values(graph.agents).map((a) => a.agentKey));
  const agentKey = privateKeyToAddress(keys.agentPrivateKey(n));
  const result = await (await getHiveClient()).tx.registerAgent({ name: agent.name, agentType: agent.agentType, agentKey }).wait();
  if (result.status === "failed") throw result.error;
  await useGraph.getState().load(owner);
  const bound = useGraph.getState().agents[result.agentId.toString()];
  if (!bound) throw new Error(`${agent.name} was set up, but the graph hasn't caught up yet. Try again in a moment.`);
  return bound;
}

/** At `expiresAt` the bridge refuses the token, so end the session here too and let the shell send the user to /login. */
function scheduleExpiry(expiresAt: number) {
  clearTimeout(expiryTimer);
  expiryTimer = setTimeout(() => {
    const { keys, owner } = useSession.getState();
    keys?.end();
    clearSigner();
    clearSavedSession();
    if (owner) clearAgentTokens(owner);
    useSession.setState({ ...initial, ...signedOut });
  }, Math.max(0, expiresAt * 1000 - Date.now()));
}

export const useSession = create<SessionState>()((set, get) => ({
  ...initial,
  restored: false,
  mode: HIVE_MODE,

  async signIn({ create = false } = {}) {
    inFlight?.abort();
    const ac = new AbortController();
    inFlight = ac;
    get().keys?.end();
    set({ ...initial, status: "waiting", keys: undefined, credentialId: undefined, error: undefined, destination: undefined });

    let keys: HiveKeys | undefined;
    try {
      const passkey = await getPasskeyService();
      const secret = await (create ? passkey.create({ signal: ac.signal }) : passkey.signIn({ signal: ac.signal }));
      set({ status: "verified" });

      keys = await passkey.deriveKeys(secret);
      secret.prfOutput.fill(0);
      set({ progress: { owner: true, encryption: true, scope: false } });

      // auth.challenge → sign → auth.verify (rules §6, Login 3)
      const client = await getHiveClient();
      const { nonce } = await client.auth.challenge(keys.ownerAddress);
      const signature = await keys.owner.signMessage({ message: authMessage(keys.ownerAddress, nonce) });
      const session = await client.auth.verify({ owner: keys.ownerAddress, nonce, signature });
      if (client.mode === "mock") {
        const k = keys;
        (client as MockHiveClient).adoptDemoAgents(session.owner, (n) => privateKeyToAddress(k.agentPrivateKey(n)));
      } else {
        (client as LiveHiveClient).useSigner({ account: keys.owner, end: () => {} });
      }
      const agents = await client.agents.list().catch(() => []);
      if (ac.signal.aborted) throw new PasskeyError("CANCELLED", "Cancelled");

      saveSession({ owner: session.owner, userToken: session.userToken, expiresAt: session.expiresAt, credentialId: secret.credentialId });
      scheduleExpiry(session.expiresAt);
      set({
        status: "signed-in",
        owner: session.owner,
        userToken: session.userToken,
        expiresAt: session.expiresAt,
        keys,
        credentialId: secret.credentialId,
        authorizations: loadAgentTokens(session.owner, nowS()),
        progress: { owner: true, encryption: true, scope: true },
        destination: agents.length > 0 ? "/canvas" : "/connect",
      });
    } catch (e) {
      keys?.end();
      clearSigner();
      if (e instanceof PasskeyError && e.code === "CANCELLED") {
        set({ ...initial });
        return;
      }
      const error: LoginError =
        e instanceof PasskeyError
          ? { code: e.code, message: e.message }
          : { code: "BRIDGE", message: e instanceof HiveError ? e.message : e instanceof Error ? e.message : String(e) };
      set({ status: "error", error, keys: undefined });
    } finally {
      if (inFlight === ac) inFlight = null;
    }
  },

  async restore() {
    restoring ??= (async () => {
      if (get().status === "signed-in") return;
      const client = await getHiveClient();
      const saved = client.mode === "live" ? loadSavedSession(nowS()) : null;
      if (client.mode !== "live" || !saved) return;
      (client as LiveHiveClient).resume(saved);
      try {
        await client.agents.list(); // the bridge is the judge of the token: it may have been rotated
      } catch (e) {
        if (e instanceof HiveError && (e.code === "UNAUTHORIZED" || e.code === "SESSION_EXPIRED")) {
          clearSavedSession();
          return;
        }
        // The bridge is unreachable: stay signed in, the app shows it offline and the stream reconnects.
      }
      scheduleExpiry(saved.expiresAt);
      set({ status: "signed-in", owner: saved.owner, userToken: saved.userToken, expiresAt: saved.expiresAt, credentialId: saved.credentialId, authorizations: loadAgentTokens(saved.owner, nowS()), progress: { owner: true, encryption: true, scope: true } });
    })()
      .catch(() => {})
      .finally(() => set({ restored: true }));
    return restoring;
  },

  async unlock() {
    const { keys, owner, credentialId } = get();
    if (keys) return keys;
    if (!owner || !credentialId) throw new Error("Sign in first.");
    unlocking ??= (async () => {
      const passkey = await getPasskeyService();
      const secret = await passkey.signIn({ credentialId });
      let derived: HiveKeys;
      try {
        derived = await passkey.deriveKeys(secret);
      } finally {
        secret.prfOutput.fill(0);
      }
      if (derived.ownerAddress.toLowerCase() !== owner.toLowerCase() || get().owner !== owner) {
        derived.end();
        throw new Error("That passkey belongs to a different Hive account.");
      }
      set({ keys: derived });
      const client = await getHiveClient();
      if (client.mode === "live") (client as LiveHiveClient).useSigner({ account: derived.owner, end: () => {} });
      return derived;
    })().finally(() => {
      unlocking = null;
    });
    return unlocking;
  },

  async connectAgent(agentType, name) {
    const { keys, owner, connections } = get();
    const current = connections[agentType]?.phase;
    if (!keys || !owner || current === "registering" || current === "authorizing" || current === "ready") return;
    const setConn = (c: Connection) => set({ connections: { ...get().connections, [agentType]: c } });

    try {
      const client = await getHiveClient();
      const graph = useGraph.getState();
      const ofType = Object.values(graph.agents).filter((a) => a.agentType === agentType);
      // Every agent of this type is hidden: don't register another one or bring a hidden one back. Show it from the sidebar.
      if (ofType.length && ofType.every((a) => graph.hidden[a.agentId.toString()])) return;
      let agent = ofType.find((a) => !graph.hidden[a.agentId.toString()]);

      // An agent with no writer key is a registration that stopped after the first transaction: finish it.
      if (!agent) {
        setConn({ phase: "registering" });
        const n = nextAgentIndex(keys, Object.values(graph.agents).map((a) => a.agentKey));
        const agentKey = privateKeyToAddress(keys.agentPrivateKey(n));
        const result = await client.tx.registerAgent({ name, agentType, agentKey }).wait();
        if (result.status === "failed") throw result.error;
        await useGraph.getState().load(owner);
        agent = useGraph.getState().agents[result.agentId.toString()];
        if (!agent) throw new Error(`${name} was registered, but the graph hasn't caught up yet. Try again in a moment.`);
      } else if (agent.agentKey === zeroAddress) {
        setConn({ phase: "registering" });
        agent = await bindIfNeeded(keys, owner, agent);
      }

      setConn({ phase: "authorizing" });
      const res = await authorizeWithKeys(keys, agent);
      setConn({ phase: "ready", agentId: agent.agentId, agentToken: res.agentToken, mcpUrl: res.mcpUrl, expiresAt: res.expiresAt });
    } catch (e) {
      setConn({ phase: "error", message: e instanceof Error ? e.message : String(e) });
    }
  },

  async createAgent(name, agentType, onStep) {
    const { owner } = get();
    if (!owner) throw new Error("Sign in first.");
    const graph = useGraph.getState();
    const checked = checkAgentName(name, Object.values(graph.agents).map((a) => a.name));
    if ("error" in checked) throw new Error(checked.error);
    const keys = await get().unlock();
    const client = await getHiveClient();
    const n = nextAgentIndex(keys, Object.values(graph.agents).map((a) => a.agentKey));
    const agentKey = privateKeyToAddress(keys.agentPrivateKey(n));
    onStep?.("registering");
    const result = await client.tx.registerAgent({ name: checked.name, agentType, agentKey }).wait();
    if (result.status === "failed") throw result.error;
    onStep?.("loading");
    await useGraph.getState().load(owner);
    const agent = useGraph.getState().agents[result.agentId.toString()];
    if (!agent) throw new Error(`${checked.name} was registered, but the graph hasn't caught up yet. Reload in a moment.`);
    onStep?.("authorizing");
    await authorizeWithKeys(keys, agent);
    await useGraph.getState().refreshAgents().catch(() => {});
    return agent.agentId;
  },

  async authorizeAgent(agentId) {
    const agent = useGraph.getState().agents[agentId.toString()];
    if (!agent) throw new Error("That agent is not on your canvas.");
    const { owner } = get();
    if (!owner) throw new Error("Sign in first.");
    const keys = await get().unlock();
    const bound = await bindIfNeeded(keys, owner, agent);
    await authorizeWithKeys(keys, bound);
    await useGraph.getState().refreshAgents().catch(() => {});
  },

  async disconnectAgent(agentId) {
    await (await getHiveClient()).agents.disconnect(agentId);
    const { [agentId.toString()]: _gone, ...authorizations } = get().authorizations;
    void _gone;
    set({ authorizations });
    persistTokens();
    await useGraph.getState().refreshAgents().catch(() => {});
  },

  async revealRecoveryPhrase() {
    const { credentialId, owner } = get();
    if (!credentialId || !owner) throw new Error("Sign in first.");
    const secret = await (await getPasskeyService()).signIn({ credentialId });
    try {
      const { deriveKeysFromPhrase, recoveryPhraseFromPrf } = await import("@/lib/passkey/keys");
      const phrase = recoveryPhraseFromPrf(secret.prfOutput);
      const check = await deriveKeysFromPhrase(phrase);
      const same = check.ownerAddress === owner;
      check.end();
      if (!same) throw new Error("That passkey belongs to a different Hive account.");
      return phrase;
    } finally {
      secret.prfOutput.fill(0);
    }
  },

  /** Login 2 → 1: aborts the open passkey prompt. */
  cancel() {
    inFlight?.abort();
  },

  reset() {
    set({ ...initial, error: undefined });
  },

  async signOut() {
    const { owner, userToken, expiresAt, keys } = get();
    try {
      if (owner && userToken && expiresAt) await (await getHiveClient()).auth.signOut({ owner, userToken, expiresAt });
    } finally {
      keys?.end();
      clearSigner();
      clearSavedSession();
      if (owner) clearAgentTokens(owner);
      clearTimeout(expiryTimer);
      set({ ...initial, ...signedOut, signedOutOnPurpose: true });
    }
  },
}));
