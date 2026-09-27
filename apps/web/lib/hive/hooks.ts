"use client";

import { useCallback, useEffect, useState } from "react";
import { readContract } from "viem/actions";
import {
  AgentRegistryAbi,
  KnowledgeGraphAbi,
  MemorySlotsAbi,
} from "@hive/shared";
import { hivePublicClient } from "./clients";
import { hiveAddresses, isHiveDeployed } from "./config";
import type { Agent, Edge, Slot } from "./types";

export interface ReadState<T> {
  data: T | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

function useHiveRead<T>(read: (() => Promise<T>) | null): ReadState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(read !== null);
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (read === null) {
      setData(undefined);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    read()
      .then((value) => {
        if (!cancelled) {
          setData(value);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [read, nonce]);

  return { data, isLoading, error, refetch };
}

// KnowledgeGraph

export function useEdgeCount(): ReadState<bigint> {
  const read = useCallback(
    () =>
      readContract(hivePublicClient, {
        address: hiveAddresses.knowledgeGraph,
        abi: KnowledgeGraphAbi,
        functionName: "edgeCount",
      }),
    [],
  );
  return useHiveRead(isHiveDeployed() ? read : null);
}

export function useHasPermission(
  from: bigint | undefined,
  to: bigint | undefined,
  topic: string | undefined,
): ReadState<boolean> {
  const read = useCallback(async () => {
    if (from === undefined || to === undefined || topic === undefined) return false;
    return readContract(hivePublicClient, {
      address: hiveAddresses.knowledgeGraph,
      abi: KnowledgeGraphAbi,
      functionName: "hasPermission",
      args: [from, to, topic],
    });
  }, [from, to, topic]);

  const ready =
    isHiveDeployed() && from !== undefined && to !== undefined && topic !== undefined;
  return useHiveRead(ready ? read : null);
}

export function useEdge(edgeId: bigint | undefined): ReadState<Edge> {
  const read = useCallback(async () => {
    if (edgeId === undefined) throw new Error("edgeId required");
    return (await readContract(hivePublicClient, {
      address: hiveAddresses.knowledgeGraph,
      abi: KnowledgeGraphAbi,
      functionName: "edge",
      args: [edgeId],
    })) as unknown as Edge;
  }, [edgeId]);
  return useHiveRead(isHiveDeployed() && edgeId !== undefined ? read : null);
}

export function useEdgesFrom(agentId: bigint | undefined): ReadState<Edge[]> {
  const read = useCallback(async () => {
    if (agentId === undefined) throw new Error("agentId required");
    return (await readContract(hivePublicClient, {
      address: hiveAddresses.knowledgeGraph,
      abi: KnowledgeGraphAbi,
      functionName: "edgesFrom",
      args: [agentId],
    })) as unknown as Edge[];
  }, [agentId]);
  return useHiveRead(isHiveDeployed() && agentId !== undefined ? read : null);
}

export function useEdgesTo(agentId: bigint | undefined): ReadState<Edge[]> {
  const read = useCallback(async () => {
    if (agentId === undefined) throw new Error("agentId required");
    return (await readContract(hivePublicClient, {
      address: hiveAddresses.knowledgeGraph,
      abi: KnowledgeGraphAbi,
      functionName: "edgesTo",
      args: [agentId],
    })) as unknown as Edge[];
  }, [agentId]);
  return useHiveRead(isHiveDeployed() && agentId !== undefined ? read : null);
}

// AgentRegistry

export function useAgent(agentId: bigint | undefined): ReadState<Agent> {
  const read = useCallback(async () => {
    if (agentId === undefined) throw new Error("agentId required");
    return (await readContract(hivePublicClient, {
      address: hiveAddresses.agentRegistry,
      abi: AgentRegistryAbi,
      functionName: "agents",
      args: [agentId],
    })) as unknown as Agent;
  }, [agentId]);
  return useHiveRead(isHiveDeployed() && agentId !== undefined ? read : null);
}

export function useAgentExists(agentId: bigint | undefined): ReadState<boolean> {
  const read = useCallback(async () => {
    if (agentId === undefined) return false;
    return readContract(hivePublicClient, {
      address: hiveAddresses.agentRegistry,
      abi: AgentRegistryAbi,
      functionName: "agentExists",
      args: [agentId],
    });
  }, [agentId]);
  return useHiveRead(isHiveDeployed() && agentId !== undefined ? read : null);
}

export function useWriterOf(agentId: bigint | undefined): ReadState<`0x${string}`> {
  const read = useCallback(async () => {
    if (agentId === undefined) throw new Error("agentId required");
    return readContract(hivePublicClient, {
      address: hiveAddresses.agentRegistry,
      abi: AgentRegistryAbi,
      functionName: "writerOf",
      args: [agentId],
    });
  }, [agentId]);
  return useHiveRead(isHiveDeployed() && agentId !== undefined ? read : null);
}

export function useOwnerOf(agentId: bigint | undefined): ReadState<`0x${string}`> {
  const read = useCallback(async () => {
    if (agentId === undefined) throw new Error("agentId required");
    return readContract(hivePublicClient, {
      address: hiveAddresses.agentRegistry,
      abi: AgentRegistryAbi,
      functionName: "ownerOf",
      args: [agentId],
    });
  }, [agentId]);
  return useHiveRead(isHiveDeployed() && agentId !== undefined ? read : null);
}

export function useAgentOf(writer: `0x${string}` | undefined): ReadState<bigint> {
  const read = useCallback(async () => {
    if (writer === undefined) throw new Error("writer required");
    return readContract(hivePublicClient, {
      address: hiveAddresses.agentRegistry,
      abi: AgentRegistryAbi,
      functionName: "agentOf",
      args: [writer],
    });
  }, [writer]);
  return useHiveRead(isHiveDeployed() && writer !== undefined ? read : null);
}

// MemorySlots

export function useSlot(slotId: bigint | undefined): ReadState<Slot> {
  const read = useCallback(async () => {
    if (slotId === undefined) throw new Error("slotId required");
    return (await readContract(hivePublicClient, {
      address: hiveAddresses.memorySlots,
      abi: MemorySlotsAbi,
      functionName: "slots",
      args: [slotId],
    })) as unknown as Slot;
  }, [slotId]);
  return useHiveRead(isHiveDeployed() && slotId !== undefined ? read : null);
}

export function useLatestSlot(agentId: bigint | undefined): ReadState<Slot> {
  const read = useCallback(async () => {
    if (agentId === undefined) throw new Error("agentId required");
    return (await readContract(hivePublicClient, {
      address: hiveAddresses.memorySlots,
      abi: MemorySlotsAbi,
      functionName: "latestSlot",
      args: [agentId],
    })) as unknown as Slot;
  }, [agentId]);
  return useHiveRead(isHiveDeployed() && agentId !== undefined ? read : null);
}

export function useSlotsSince(
  agentId: bigint | undefined,
  since: bigint | undefined,
): ReadState<Slot[]> {
  const read = useCallback(async () => {
    if (agentId === undefined || since === undefined) throw new Error("agentId and since required");
    return (await readContract(hivePublicClient, {
      address: hiveAddresses.memorySlots,
      abi: MemorySlotsAbi,
      functionName: "slotsSince",
      args: [agentId, since],
    })) as unknown as Slot[];
  }, [agentId, since]);
  const ready = isHiveDeployed() && agentId !== undefined && since !== undefined;
  return useHiveRead(ready ? read : null);
}

export function useSlotCount(): ReadState<bigint> {
  const read = useCallback(
    () =>
      readContract(hivePublicClient, {
        address: hiveAddresses.memorySlots,
        abi: MemorySlotsAbi,
        functionName: "slotCount",
      }),
    [],
  );
  return useHiveRead(isHiveDeployed() ? read : null);
}

