import { HiveError } from "@hive/shared";
import { BaseError, InsufficientFundsError, type Hex } from "viem";
import { describe, expect, it, vi } from "vitest";
import { identityCardUrl, registerIdentity, type IdentityDeps } from "./identity";

const HASH = `0x${"ab".repeat(32)}` as Hex;
const BRIDGE = "https://bridge.example.com";

const fake = (over: Partial<IdentityDeps> = {}): IdentityDeps => ({ register: vi.fn(async () => ({ erc8004Id: BigInt(2142), txHash: HASH })), ...over });

describe("identityCardUrl", () => {
  it("points at the bridge's card for the Hive agent id", () => {
    expect(identityCardUrl(BRIDGE, BigInt(7))).toBe("https://bridge.example.com/agents/7/card.json");
    expect(identityCardUrl(`${BRIDGE}/`, BigInt(7))).toBe("https://bridge.example.com/agents/7/card.json");
  });

  it("refuses anything that is not a plain https URL", () => {
    for (const bad of [undefined, "", "http://localhost:4000", "http://bridge.example.com", "bridge.example.com", "https://user:pw@bridge.example.com", "https://bridge.example.com/?token=abc"]) {
      expect(identityCardUrl(bad, BigInt(7)), String(bad)).toBeNull();
    }
  });
});

describe("registerIdentity", () => {
  it("registers the card URL for that agent and returns the new id", async () => {
    const deps = fake();
    await expect(registerIdentity(deps, { bridgeUrl: BRIDGE, agentId: BigInt(7) })).resolves.toEqual({ erc8004Id: BigInt(2142), txHash: HASH });
    expect(deps.register).toHaveBeenCalledWith("https://bridge.example.com/agents/7/card.json", BigInt(7));
  });

  it("sends nothing when the bridge is local", async () => {
    const deps = fake();
    await expect(registerIdentity(deps, { bridgeUrl: "http://localhost:4000", agentId: BigInt(7) })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(deps.register).not.toHaveBeenCalled();
  });

  it("tells the owner when the account has no MON", async () => {
    const deps = fake({ register: vi.fn(async () => { throw new BaseError("rejected", { cause: new InsufficientFundsError() }); }) });
    await expect(registerIdentity(deps, { bridgeUrl: BRIDGE, agentId: BigInt(7) })).rejects.toThrow(/no MON for gas/);
  });

  it("hides whatever else the chain says behind a fixed message", async () => {
    const deps = fake({ register: vi.fn(async () => { throw new Error("rpc https://secret.example/key=abc failed"); }) });
    const error = await registerIdentity(deps, { bridgeUrl: BRIDGE, agentId: BigInt(7) }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HiveError);
    expect((error as HiveError).message).toBe("Could not add the ERC-8004 identity on Monad.");
  });
});
