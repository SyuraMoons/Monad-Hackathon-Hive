// All demo data lives here and nowhere else (rules.md golden rule 8). Wire format, so it goes
// through the same zod schemas as the live bridge and Envio responses.
import type { GraphSnapshotWire } from "@hive/shared";

export const MOCK_OWNER = "0x7f3a4c2e9b1d6f8a0c3e5b7d9f1a2c4e6b80c21e";

const DAY = 86_400;
export const now = () => Math.floor(Date.now() / 1000);

export const MOCK_AGENT_KEYS = {
  claude: "0x9c5b2e8f1a4d7c0b3e6f9a2d5c8b1e4f7a0d4e1a",
  gpt: "0x27e4a1c7f0b3d6e9a2c5f8b1d4e7a0c3f6b9b83f",
  therapy: "0x51d8b2f5a9c3e6b0d4f7a1c8e2b5d9f3a6c0a90c",
} as const;

export const MOCK_EDGE_TX = "0x4f1c" + "7d2e8b3a".repeat(7) + "9a2e";

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

/** Memory text by content hash. The live client fetches ciphertext and decrypts locally instead. */
export const MOCK_MEMORY: Record<string, string> = {
  ["0x" + "a1".repeat(32)]: "Working on project Nexus, deadline Oct 13.",
  ["0x" + "b2".repeat(32)]: "Remember I prefer short answers in the morning.",
};

/** Figma Canvas 1 Live (55:46) feed, as bridge events. Offsets are seconds before "now". */
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
