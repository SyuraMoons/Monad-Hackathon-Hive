"use client";

import { useState } from "react";
import { explorerAddressUrl, monadTestnet } from "@hive/shared";
import { hiveAddresses, isHiveDeployed } from "@/lib/hive/config";
import { useEdgeCount, useHasPermission, useSlotCount } from "@/lib/hive/hooks";

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
            Not deployed. Set NEXT_PUBLIC_HIVE_* in .env after AK-7.
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
    </main>
  );
}
