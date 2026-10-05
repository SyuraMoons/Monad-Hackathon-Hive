"use client";

import { authMessage, HiveError, type Address, type AgentId, type AgentType } from "@hive/shared";
import { bytesToHex } from "viem";
import { privateKeyToAddress } from "viem/accounts";
import { create } from "zustand";
import { getHiveClient, HIVE_MODE } from "@/lib/hive/client";
import type { HiveMode } from "@/lib/hive/types";
import { useGraph } from "./graph";
import type { MockHiveClient } from "@/lib/hive/mock";
import { getPasskeyService, PasskeyError, type HiveKeys, type PasskeyErrorCode } from "@/lib/passkey";

/** Login screen states (Figma 05 · Login): 1 signed-out · 2 waiting · 3 verified · 4 error. */
type Status = "signed-out" | "waiting" | "verified" | "signed-in" | "error";

export type LoginError = { code: PasskeyErrorCode | "BRIDGE"; message: string };

type SessionState = {
  status: Status;
  mode: HiveMode;
  owner?: Address;
  userToken?: string;
  expiresAt?: number;
  /** Derived from the passkey on this device. Memory only: never persisted, gone on reload. */
  keys?: HiveKeys;
  /** The passkey that signed in, so the recovery phrase is revealed by that passkey only. */
  credentialId?: string;
  /** Which key rows on Login 3 are done. */
  progress: { owner: boolean; encryption: boolean; scope: boolean };
  /** Where to go after Login 3: /connect when no agent is connected yet (rules §6). */
  destination?: "/connect" | "/canvas";
  error?: LoginError;
  /** True after the user chose Sign out, so the app sends them home rather than back to /login. */
  signedOutOnPurpose: boolean;
  /** Per agent type on the Connect page. Tokens are bearer secrets: memory only. */
  connections: Partial<Record<AgentType, Connection>>;
  signIn(options?: { create?: boolean }): Promise<void>;
  /** Connect page: register the agent if needed (owner userOp), then authorize it with the bridge (rules O1, §5.1). */
  connectAgent(agentType: AgentType, name: string): Promise<void>;
  /** Asks the signed-in passkey again and returns the 24-word recovery phrase. Never stored. */
  revealRecoveryPhrase(): Promise<string>;
  cancel(): void;
  reset(): void;
  signOut(): Promise<void>;
};

export type Connection =
  | { phase: "registering" | "authorizing" }
  | { phase: "ready"; agentId: AgentId; agentToken: string; mcpUrl: string; expiresAt: number }
  | { phase: "error"; message: string };

let inFlight: AbortController | null = null;

const initial = { status: "signed-out" as Status, progress: { owner: false, encryption: false, scope: false }, connections: {}, signedOutOnPurpose: false };

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

export const useSession = create<SessionState>()((set, get) => ({
  ...initial,
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
      }
      const agents = await client.agents.list().catch(() => []);
      if (ac.signal.aborted) throw new PasskeyError("CANCELLED", "Cancelled");

      set({
        status: "signed-in",
        owner: session.owner,
        userToken: session.userToken,
        expiresAt: session.expiresAt,
        keys,
        credentialId: secret.credentialId,
        progress: { owner: true, encryption: true, scope: true },
        destination: agents.some((a) => a.connected) ? "/canvas" : "/connect",
      });
    } catch (e) {
      keys?.end();
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

  async connectAgent(agentType, name) {
    const { keys, owner, connections } = get();
    const current = connections[agentType]?.phase;
    if (!keys || !owner || current === "registering" || current === "authorizing" || current === "ready") return;
    const setConn = (c: Connection) => set({ connections: { ...get().connections, [agentType]: c } });

    try {
      const client = await getHiveClient();
      const graph = useGraph.getState();
      let agent = Object.values(graph.agents).find((a) => a.agentType === agentType);

      if (!agent) {
        setConn({ phase: "registering" });
        const n = nextAgentIndex(keys, Object.values(graph.agents).map((a) => a.agentKey));
        const agentKey = privateKeyToAddress(keys.agentPrivateKey(n));
        const result = await client.tx.registerAgent({ name, agentType, agentKey }).wait();
        if (result.status === "failed") throw result.error;
        await useGraph.getState().load(owner);
        agent = useGraph.getState().agents[result.agentId.toString()];
        if (!agent) throw new Error(`${name} was registered, but the graph hasn't caught up yet. Try again in a moment.`);
      }

      setConn({ phase: "authorizing" });
      const n = findAgentIndex(keys, agent.agentKey);
      if (n === null) throw new Error(`${name} was registered with a different passkey, so this one can't authorize it.`);
      const res = await client.agents.authorize(agent.agentId, { agentPrivateKey: keys.agentPrivateKey(n), encryptionKey: bytesToHex(keys.encryptionKey) });
      setConn({ phase: "ready", agentId: agent.agentId, agentToken: res.agentToken, mcpUrl: res.mcpUrl, expiresAt: res.expiresAt });
    } catch (e) {
      setConn({ phase: "error", message: e instanceof Error ? e.message : String(e) });
    }
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
      set({ ...initial, signedOutOnPurpose: true, owner: undefined, userToken: undefined, expiresAt: undefined, keys: undefined, credentialId: undefined, destination: undefined, error: undefined });
    }
  },
}));
