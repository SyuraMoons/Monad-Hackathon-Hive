import { AgentRegistryAbi, hiveDeployment } from "@hive/shared";
import { BaseError, ContractFunctionRevertedError, encodeErrorResult } from "viem";
import { describe, expect, it } from "vitest";
import { ViemChainReader } from "../src/chain.js";
import { topicHash } from "../src/permissions.js";
import { UnknownAgentError } from "../src/types.js";

const OWNER = "0x00000000000000000000000000000000000000A1";

type Call = { address: string; functionName: string; args: readonly unknown[] };

function fakeClient(answer: (call: Call) => unknown) {
  const calls: Call[] = [];
  return {
    calls,
    client: {
      readContract: async (call: Call) => {
        calls.push(call);
        return answer(call);
      },
    } as never,
  };
}

describe("ViemChainReader", () => {
  it("edgesTo reads KnowledgeGraph and maps the bytes32 topic to topicHash", async () => {
    const hash = topicHash("work");
    const { client, calls } = fakeClient(() => [{ id: 1n, from: 1n, to: 2n, topic: hash, expiresAt: 99n, active: true }]);
    const edges = await new ViemChainReader(client).edgesTo(2n);
    expect(edges).toEqual([{ id: 1n, from: 1n, to: 2n, topicHash: hash, expiresAt: 99n, active: true }]);
    expect(calls).toEqual([{ address: hiveDeployment.knowledgeGraph, abi: expect.anything(), functionName: "edgesTo", args: [2n] }]);
  });

  it("keeps inactive edges so the permission engine can deny them", async () => {
    const { client } = fakeClient(() => [{ id: 1n, from: 1n, to: 2n, topic: topicHash("work"), expiresAt: 99n, active: false }]);
    const [edge] = await new ViemChainReader(client).edgesTo(2n);
    expect(edge?.active).toBe(false);
  });

  it("slotsSince reads MemorySlots and maps slots", async () => {
    const hash = ("0x" + "ab".repeat(32)) as `0x${string}`;
    const { client, calls } = fakeClient(() => [{ id: 7n, agentId: 1n, contentHash: hash, topic: "work", writtenAt: 50n }]);
    const slots = await new ViemChainReader(client).slotsSince(1n, 40n);
    expect(slots).toEqual([{ id: 7n, agentId: 1n, contentHash: hash, topic: "work", writtenAt: 50n }]);
    expect(calls[0]).toMatchObject({ address: hiveDeployment.memorySlots, functionName: "slotsSince", args: [1n, 40n] });
  });

  it("agent reads AgentRegistry and returns id, name, owner", async () => {
    const { client, calls } = fakeClient(() => ({ owner: OWNER, name: "Claude", agentType: "claude", pubKey: "0x", writer: OWNER, registeredAt: 1n }));
    const agent = await new ViemChainReader(client).agent(3n);
    expect(agent).toEqual({ id: 3n, name: "Claude", owner: OWNER, agentType: "claude", writer: OWNER });
    expect(calls[0]).toMatchObject({ address: hiveDeployment.agentRegistry, functionName: "agents", args: [3n] });
  });

  it("lets an RPC failure propagate (the read flow turns it into default deny)", async () => {
    const reader = new ViemChainReader({ readContract: async () => { throw new Error("rpc down"); } } as never);
    await expect(reader.edgesTo(1n)).rejects.toThrow("rpc down");
    await expect(reader.slotsSince(1n, 0n)).rejects.toThrow("rpc down");
    await expect(reader.agent(1n)).rejects.toThrow("rpc down");
  });

  const unknownAgentRevert = () => {
    const data = encodeErrorResult({ abi: AgentRegistryAbi, errorName: "UnknownAgent", args: [9n] });
    return new BaseError("call failed", { cause: new ContractFunctionRevertedError({ abi: AgentRegistryAbi, data, functionName: "agents" }) });
  };

  it("agent rejects with UnknownAgentError on an UnknownAgent revert, but not on other failures", async () => {
    const reverting = new ViemChainReader({ readContract: async () => { throw unknownAgentRevert(); } } as never);
    await expect(reverting.agent(9n)).rejects.toBeInstanceOf(UnknownAgentError);
    const down = new ViemChainReader({ readContract: async () => { throw new BaseError("rpc down"); } } as never);
    await expect(down.agent(9n)).rejects.not.toBeInstanceOf(UnknownAgentError);
  });

  it("agentsOf is one AgentRegistry.agentsOf call keyed by owner", async () => {
    const row = (name: string) => ({ owner: OWNER, name, agentType: "claude", pubKey: "0x", writer: OWNER, registeredAt: 1n });
    const { client, calls } = fakeClient(() => [[1n, 3n], [row("a"), row("b")]]);
    const mine = await new ViemChainReader(client).agentsOf(OWNER);
    expect(mine).toEqual([
      { id: 1n, name: "a", owner: OWNER, agentType: "claude", writer: OWNER },
      { id: 3n, name: "b", owner: OWNER, agentType: "claude", writer: OWNER },
    ]);
    expect(calls).toEqual([{ address: hiveDeployment.agentRegistry, abi: AgentRegistryAbi, functionName: "agentsOf", args: [OWNER] }]);
  });

  it("agentsOf lets an RPC failure propagate", async () => {
    const reader = new ViemChainReader({ readContract: async () => { throw new BaseError("rpc down"); } } as never);
    await expect(reader.agentsOf(OWNER)).rejects.toThrow("rpc down");
  });
});
