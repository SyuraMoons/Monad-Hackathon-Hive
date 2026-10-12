// All demo data lives here and nowhere else. Wire format, so it goes
// through the same zod schemas as the live bridge and Envio responses.
import type { GraphSnapshotWire } from "@hive/shared";
import { bytesToHex } from "viem";
import { HDKey, privateKeyToAddress } from "viem/accounts";

const DAY = 86_400;
export const now = () => Math.floor(Date.now() / 1000);

// Placeholder keys until someone signs in. The passkey is always real, so on sign-in adoptDemoAgents()
// hands the demo agents to that owner and swaps in its m/44'/60'/0'/0/{n} addresses.
const PLACEHOLDER_SEED = new Uint8Array(32).map((_, i) => (i * 37 + 11) & 0xff);

const mockKey = (n: number) => privateKeyToAddress(bytesToHex(HDKey.fromMasterSeed(PLACEHOLDER_SEED).derive(`m/44'/60'/0'/0/${n}`).privateKey!));

export const MOCK_OWNER = mockKey(0);

/** Replaced on sign-in, so authorize can prove the signed-in passkey's agent keys like the real bridge. */
const MOCK_AGENT_KEYS = {
  claude: mockKey(1),
  gpt: mockKey(2),
  therapy: mockKey(3),
} as const;

const MOCK_EDGE_TX = "0x4f1c" + "7d2e8b3a".repeat(7) + "9a2e";

export function initialGraph(): GraphSnapshotWire {
  const t = now();
  return {
    agents: [
      { agentId: "1", owner: MOCK_OWNER, agentKey: MOCK_AGENT_KEYS.claude, name: "Claude", agentType: "claude", registeredAt: t - 3 * DAY },
      { agentId: "2", owner: MOCK_OWNER, agentKey: MOCK_AGENT_KEYS.gpt, name: "GPT", agentType: "gpt", registeredAt: t - 3 * DAY },
      { agentId: "3", owner: MOCK_OWNER, agentKey: MOCK_AGENT_KEYS.therapy, name: "Therapy Bot", agentType: "therapy-bot", registeredAt: t - 2 * DAY },
    ],
    edges: [
      { edgeId: "1", from: "1", to: "2", topic: "work", expiresAt: t + 30 * DAY, active: true, addedTx: MOCK_EDGE_TX, removedTx: null },
    ],
  };
}

/** ?mock=stress: 20 agents in a chain with work and research edges, for the 60 fps check (step 6). */
export function stressGraph(): GraphSnapshotWire {
  const t = now();
  const agents = Array.from({ length: 20 }, (_, i) => ({
    agentId: String(i + 1), owner: MOCK_OWNER, agentKey: mockKey(i + 1), name: `Agent ${i + 1}`,
    agentType: (["claude", "gpt", "other"] as const)[i % 3], registeredAt: t - DAY,
  }));
  const edges = agents.slice(0, -1).map((a, i) => ({
    edgeId: String(i + 1), from: a.agentId, to: String(i + 2), topic: i % 2 ? "research" : "work",
    expiresAt: t + 7 * DAY, active: true, addedTx: "0x" + (i + 1).toString(16).padStart(64, "0"), removedTx: null,
  }));
  return { agents, edges };
}

/** Memory text by content hash. The live client fetches ciphertext and decrypts locally instead. */
export const MOCK_MEMORY: Record<string, string> = {
  ["0x" + "a1".repeat(32)]: "Working on project Nexus, deadline Oct 13.",
  ["0x" + "b2".repeat(32)]: "Remember I prefer short answers in the morning.",
};

/** The canvas live feed, as bridge events. Offsets are seconds before "now". */
export const MOCK_SEED_EVENTS = [
  { ago: 272, type: "memory.written", data: { slotId: "1", agentId: "1", topic: "personal", contentHash: "0x" + "b2".repeat(32), txHash: "0x" + "c3".repeat(32), propagatedTo: [] } },
  { ago: 21, type: "memory.written", data: { slotId: "2", agentId: "1", topic: "work", contentHash: "0x" + "a1".repeat(32), txHash: "0x" + "d4".repeat(32), propagatedTo: ["2"] } },
  { ago: 19, type: "memory.read", data: { readerAgentId: "2", fromAgentIds: ["1"], count: 1 } },
] as const;

/** What the timer writes next, round-robin, so pulses and feed rows can be seen in development. */
export const MOCK_LIVE_WRITES: Array<{ agentId: string; topic: string; content: string }> = [
  { agentId: "1", topic: "work", content: "Standup moved to 10:30. Ship the canvas before the demo." },
  { agentId: "1", topic: "personal", content: "Book a dentist appointment next week." },
  { agentId: "2", topic: "work", content: "Summarised the Nexus spec into five tasks." },
  { agentId: "1", topic: "work", content: "Reviewer asked for a Monadscan link on every edge." },
];
