import { HiveError } from "@hive/shared";
import { BaseError, InsufficientFundsError, zeroAddress, type Address, type Hex } from "viem";
import { describe, expect, it, vi } from "vitest";
import { agentsOf, registerAndBind, toAgent, type ChainAgent, type RegistryDeps } from "./registry";

const OWNER: Address = "0x6AC6951B0a53d7a059A121494691A84b5403dF5A";
const OTHER: Address = "0x00000000000000000000000000000000000000b2";
const KEY: Address = "0x00000000000000000000000000000000000000c3";
const HASH = `0x${"ab".repeat(32)}` as Hex;

const agent = (id: number, over: Partial<ChainAgent> = {}): ChainAgent => ({
  id: BigInt(id), owner: OWNER, name: `agent-${id}`, agentType: "claude", writer: zeroAddress, registeredAt: BigInt(1_700_000_000), ...over,
});

/** A registry holding `rows` (ids 1..n); anything past them is unknown. */
function fake(rows: ChainAgent[], over: Partial<RegistryDeps> = {}): RegistryDeps & { readAgent: ReturnType<typeof vi.fn> } {
  return {
    readAgent: vi.fn(async (id: bigint) => rows.find((r) => r.id === id) ?? null),
    register: vi.fn(async () => ({ agentId: BigInt(rows.length + 1), txHash: HASH })),
    setWriter: vi.fn(async () => HASH),
    ...over,
  } as RegistryDeps & { readAgent: ReturnType<typeof vi.fn> };
}

describe("agentsOf", () => {
  it("keeps only the owner's agents and stops at the first unknown id", async () => {
    const deps = fake([agent(1), agent(2, { owner: OTHER }), agent(3)]);
    expect((await agentsOf(deps, OWNER)).map((a) => a.id)).toEqual([BigInt(1), BigInt(3)]);
    expect(deps.readAgent).toHaveBeenCalledTimes(8);
  });

  it("matches the owner whatever the address casing", async () => {
    const deps = fake([agent(1, { owner: OWNER.toLowerCase() as Address })]);
    expect(await agentsOf(deps, OWNER)).toHaveLength(1);
  });

  it("scans on past the first batch of eight", async () => {
    const deps = fake(Array.from({ length: 10 }, (_, i) => agent(i + 1)));
    expect(await agentsOf(deps, OWNER)).toHaveLength(10);
  });

  it("rejects when the registry can't be read", async () => {
    const deps = fake([], { readAgent: vi.fn().mockRejectedValue(new HiveError("CHAIN_ERROR", "down")) });
    await expect(agentsOf(deps, OWNER)).rejects.toThrow("down");
  });
});

describe("toAgent", () => {
  it("maps the registry row to the shared Agent shape", () => {
    const a = toAgent(agent(1, { writer: KEY }));
    expect(a).toMatchObject({ agentId: BigInt(1), agentType: "claude", registeredAt: 1_700_000_000 });
    expect(a.agentKey.toLowerCase()).toBe(KEY.toLowerCase());
  });

  it("turns an unknown type, like the dev signer's \"chatbot\", into \"other\"", () => {
    expect(toAgent(agent(1, { agentType: "chatbot" })).agentType).toBe("other");
  });
});

describe("registerAndBind", () => {
  const input = { owner: OWNER, name: "Claude", agentType: "claude" as const, agentKey: KEY };

  it("registers, then binds the writer to the id from the receipt", async () => {
    const deps = fake([agent(1, { agentType: "gpt", writer: OTHER })]);
    const out = await registerAndBind(deps, input);
    expect(deps.register).toHaveBeenCalledWith("Claude", "claude", KEY);
    expect(deps.setWriter).toHaveBeenCalledWith(BigInt(2), KEY);
    expect(out).toEqual({ agentId: BigInt(2), txHash: HASH });
  });

  it("only binds the writer for an agent a stopped attempt left without one", async () => {
    const deps = fake([agent(1)]);
    const out = await registerAndBind(deps, input);
    expect(deps.register).not.toHaveBeenCalled();
    expect(deps.setWriter).toHaveBeenCalledWith(BigInt(1), KEY);
    expect(out.agentId).toBe(BigInt(1));
  });

  it("does not reuse another owner's unbound agent", async () => {
    const deps = fake([agent(1, { owner: OTHER })]);
    await registerAndBind(deps, input);
    expect(deps.register).toHaveBeenCalledOnce();
  });

  it("does not bind a writer when register fails", async () => {
    const deps = fake([], { register: vi.fn().mockRejectedValue(new HiveError("CHAIN_ERROR", "The transaction was reverted onchain.")) });
    await expect(registerAndBind(deps, input)).rejects.toThrow("reverted onchain");
    expect(deps.setWriter).not.toHaveBeenCalled();
  });

  it("explains an account with no MON, without echoing the RPC error", async () => {
    const rpc = new BaseError("insufficient funds for 0xSECRET", { cause: new InsufficientFundsError() });
    const deps = fake([], { register: vi.fn().mockRejectedValue(rpc) });
    const err = await registerAndBind(deps, input).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HiveError);
    expect((err as HiveError).code).toBe("CHAIN_ERROR");
    expect((err as HiveError).message).toMatch(/no MON for gas/);
    expect((err as HiveError).message).not.toContain("SECRET");
  });

  it("hides any other failure behind a fixed message", async () => {
    const deps = fake([], { setWriter: vi.fn().mockRejectedValue(new Error("rpc said 0xSECRET")) });
    const err = (await registerAndBind(deps, input).catch((e: unknown) => e)) as HiveError;
    expect(err.message).toBe("Could not register the agent on Monad.");
  });
});
