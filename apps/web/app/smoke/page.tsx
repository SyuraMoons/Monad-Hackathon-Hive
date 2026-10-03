"use client";

import { useState } from "react";
import { keccak256, toHex } from "viem";
import { explorerAddressUrl, monadTestnet } from "@hive/shared";
import { hiveAddresses, isHiveDeployed } from "@/lib/hive/config";
import { useEdgeCount, useHasPermission, useSlotCount } from "@/lib/hive/hooks";
import { addEdge, decodeAgentRegisteredId, devSigner, registerAgent } from "@/lib/hive/account";
import { connectMeraSigner, describeMeraError } from "@/lib/hive/mera";
import type { HiveSigner } from "@/lib/hive/signer";
import { useTxStatus } from "@/lib/hive/useTxStatus";
import { hivePublicClient } from "@/lib/hive/clients";

function parseId(raw: string): bigint | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  try {
    return BigInt(trimmed);
  } catch {
    return undefined;
  }
}

const ADDRESS_ENTRIES: Array<[string, `0x${string}`]> = [
  ["AgentRegistry", hiveAddresses.agentRegistry],
  ["KnowledgeGraph", hiveAddresses.knowledgeGraph],
  ["MemorySlots", hiveAddresses.memorySlots],
  ["PropagationEngine", hiveAddresses.propagationEngine],
];

export default function SmokePage() {
  const deployed = isHiveDeployed();
  const edgeCount = useEdgeCount();
  const slotCount = useSlotCount();

  const [from, setFrom] = useState("1");
  const [to, setTo] = useState("2");
  const [topic, setTopic] = useState("demo");

  const fromId = parseId(from);
  const toId = parseId(to);
  const topicValue = topic.trim() === "" ? undefined : topic;
  const permission = useHasPermission(fromId, toId, topicValue);

  // Write layer (CP1). A signer is either a Mera passkey account or the
  // dev-only raw-key fallback (D10). Register two agents, then add an edge.
  const [signer, setSigner] = useState<HiveSigner | null>(null);
  const [userName, setUserName] = useState("demo user");
  const [agentA, setAgentA] = useState<bigint | null>(null);
  const [agentB, setAgentB] = useState<bigint | null>(null);
  const [expiryHours, setExpiryHours] = useState("24");
  const [lastTx, setLastTx] = useState<`0x${string}` | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const tx = useTxStatus(lastTx);

  async function connectPasskey() {
    setBusy(true);
    setWriteError(null);
    try {
      const s = await connectMeraSigner({
        name: userName.trim() || "demo",
        displayName: userName.trim() || "Demo User",
      });
      setSigner(s);
    } catch (err) {
      setWriteError(describeMeraError(err));
    } finally {
      setBusy(false);
    }
  }

  function connectDev() {
    const s = devSigner();
    if (!s) {
      setWriteError(
        "Dev signer not configured. Set NEXT_PUBLIC_HIVE_DEV_SIGNER=true and NEXT_PUBLIC_HIVE_DEV_SIGNER_PRIVATE_KEY in apps/web/.env.",
      );
      return;
    }
    setSigner(s);
  }

  function disconnect() {
    signer?.end();
    setSigner(null);
    setAgentA(null);
    setAgentB(null);
  }

  async function register(which: "a" | "b") {
    if (!signer) return;
    setBusy(true);
    setWriteError(null);
    try {
      const name = which === "a" ? "Claude" : "Cursor";
      const hash = await registerAgent(signer, name, "chatbot", keccak256(toHex(name)));
      setLastTx(hash);
      const receipt = await hivePublicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      const id = decodeAgentRegisteredId(receipt);
      if (which === "a") setAgentA(id ?? null);
      else setAgentB(id ?? null);
    } catch (err) {
      setWriteError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function addEdgeNow() {
    if (!signer || agentA === null || agentB === null) return;
    setBusy(true);
    setWriteError(null);
    try {
      const hours = Number(expiryHours);
      const safeHours = Number.isFinite(hours) && hours > 0 ? hours : 24;
      const expiresAt = BigInt(Math.floor(Date.now() / 1000)) + BigInt(Math.round(safeHours * 3600));
      const hash = await addEdge(signer, agentA, agentB, topicValue ?? "demo", expiresAt);
      setLastTx(hash);
    } catch (err) {
      setWriteError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 p-8 font-mono text-sm text-zinc-100">
      <h1 className="mb-1 text-xl font-bold">Hive contract smoke test</h1>
      <p className="mb-6 text-zinc-400">
        chain {monadTestnet.id} · {monadTestnet.name}
      </p>

      <section className="mb-6">
        <h2 className="mb-2 font-semibold">Deployment</h2>
        {deployed ? (
          <ul className="space-y-1">
            {ADDRESS_ENTRIES.map(([label, address]) => (
              <li key={label}>
                <span className="text-zinc-400">{label}: </span>
                <a
                  className="text-sky-400 hover:underline"
                  href={explorerAddressUrl(address)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {address}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-amber-400">
            Not deployed. Regenerate addresses with `pnpm --filter @hive/contracts abi`
            (deployments/monad-testnet.json was missing at build time).
          </p>
        )}
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-semibold">Reads</h2>
        <p>
          edgeCount:{" "}
          {edgeCount.isLoading
            ? "loading…"
            : edgeCount.error
              ? `error: ${edgeCount.error.message}`
              : edgeCount.data?.toString()}
        </p>
        <p>
          slotCount:{" "}
          {slotCount.isLoading
            ? "loading…"
            : slotCount.error
              ? `error: ${slotCount.error.message}`
              : slotCount.data?.toString()}
        </p>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">hasPermission</h2>
        <div className="mb-2 flex gap-2">
          <input
            className="w-24 rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="from"
          />
          <input
            className="w-24 rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="to"
          />
          <input
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="topic"
          />
        </div>
        <p>
          {fromId !== undefined && toId !== undefined && topicValue !== undefined ? (
            permission.isLoading
              ? "checking…"
              : permission.error
                ? `error: ${permission.error.message}`
                : `hasPermission(${fromId}, ${toId}, "${topicValue}") → ${String(permission.data)}`
          ) : (
            "enter numeric from/to ids and a topic"
          )}
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-semibold">Write (CP1: passkey → addEdge)</h2>
        {signer ? (
          <div className="space-y-2">
            <p>
              <span className="text-zinc-400">signer: </span>
              <a
                className="text-sky-400 hover:underline"
                href={explorerAddressUrl(signer.account.address)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {signer.account.address}
              </a>
            </p>
            <div className="flex gap-2">
              <button
                disabled={busy}
                onClick={() => register("a")}
                className="rounded border border-zinc-700 px-2 py-1 hover:border-zinc-500 disabled:opacity-40"
              >
                Register A (Claude)
              </button>
              <button
                disabled={busy}
                onClick={() => register("b")}
                className="rounded border border-zinc-700 px-2 py-1 hover:border-zinc-500 disabled:opacity-40"
              >
                Register B (Cursor)
              </button>
            </div>
            <p className="text-zinc-400">
              A: {agentA === null ? "—" : agentA.toString()} · B: {agentB === null ? "—" : agentB.toString()}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-zinc-400">topic: {topicValue ?? "demo"}</span>
              <span className="text-zinc-400">expiry (h)</span>
              <input
                className="w-16 rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
                value={expiryHours}
                onChange={(e) => setExpiryHours(e.target.value)}
              />
              <button
                disabled={busy || agentA === null || agentB === null}
                onClick={addEdgeNow}
                className="rounded border border-zinc-700 px-2 py-1 hover:border-zinc-500 disabled:opacity-40"
              >
                Add edge A→B
              </button>
            </div>
            <button
              onClick={disconnect}
              className="rounded border border-zinc-700 px-2 py-1 hover:border-zinc-500"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              className="w-40 rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="user name"
            />
            <button
              disabled={busy}
              onClick={connectPasskey}
              className="rounded border border-zinc-700 px-2 py-1 hover:border-zinc-500 disabled:opacity-40"
            >
              Connect passkey
            </button>
            <button
              disabled={busy}
              onClick={connectDev}
              className="rounded border border-zinc-700 px-2 py-1 hover:border-zinc-500 disabled:opacity-40"
            >
              Use dev signer
            </button>
          </div>
        )}
        {writeError && <p className="mt-2 text-red-400">{writeError}</p>}
        {tx.hash && (
          <p className="mt-2">
            tx: {tx.status}{" "}
            {tx.explorerUrl ? (
              <a className="text-sky-400 hover:underline" href={tx.explorerUrl} target="_blank" rel="noopener noreferrer">
                {tx.hash}
              </a>
            ) : (
              tx.hash
            )}
          </p>
        )}
      </section>
    </main>
  );
}
