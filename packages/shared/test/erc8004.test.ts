import { describe, expect, it } from "vitest";
import { toEventSelector, toFunctionSelector, getAbiItem } from "viem";
import {
  ERC8004_HIVE_AGENT_KEY,
  ERC8004_REGISTRATION_TYPE,
  Erc8004IdentityRegistryAbi,
  agentCardPath,
  agentCardUrl,
  decodeHiveAgentRef,
  encodeHiveAgentRef,
  erc8004Deployment,
  hiveDeployment,
  zAgentCard,
} from "../src/index.js";

const OWNER = "0x7f3a00000000000000000000000000000000c21e";

const card = {
  type: ERC8004_REGISTRATION_TYPE,
  name: "Claude",
  description: "Hive agent",
  services: [{ name: "MCP", endpoint: "https://bridge.example.com/mcp", version: "2025-11-25" }],
  x402Support: false,
  active: true,
  registrations: [],
  supportedTrust: [],
  hive: { chainId: 10143, agentRegistry: hiveDeployment.agentRegistry, agentId: "7", agentType: "claude", owner: OWNER },
};

describe("erc8004", () => {
  it("is on the same chain as the Hive contracts", () => {
    expect(erc8004Deployment.chainId).toBe(hiveDeployment.chainId);
  });

  // Selectors and topics found in the deployed implementation's bytecode on Monad testnet (11 Oct 2026).
  it("matches the deployed registry's selectors and event topics", () => {
    const item = (name: "register" | "getMetadata" | "tokenURI" | "ownerOf" | "Registered" | "MetadataSet") => getAbiItem({ abi: Erc8004IdentityRegistryAbi, name });
    expect(toFunctionSelector(item("register"))).toBe("0x8ea42286");
    expect(toFunctionSelector(item("getMetadata"))).toBe("0xcb4799f2");
    expect(toFunctionSelector(item("tokenURI"))).toBe("0xc87b56dd");
    expect(toFunctionSelector(item("ownerOf"))).toBe("0x6352211e");
    expect(toEventSelector(item("Registered"))).toBe("0xca52e62c367d81bb2e328eb795f7c7ba24afb478408a26c0e201d155c449bc4a");
    expect(toEventSelector(item("MetadataSet"))).toBe("0x2c149ed548c6d2993cd73efe187df6eccabe4538091b33adbd25fafdb8a1468b");
  });

  it("keeps the onchain metadata key", () => {
    expect(ERC8004_HIVE_AGENT_KEY).toBe("hiveAgentId");
  });

  it("round-trips a Hive agent reference", () => {
    const value = encodeHiveAgentRef(hiveDeployment.agentRegistry, 7n);
    expect(value).toHaveLength(2 + 128);
    expect(decodeHiveAgentRef(value)).toEqual({ agentRegistry: hiveDeployment.agentRegistry, agentId: 7n });
  });

  it("refuses a value that is not one address and one uint256", () => {
    const value = encodeHiveAgentRef(hiveDeployment.agentRegistry, 7n);
    for (const bad of ["0x", "0x07", `${value}00`, `0x${"ff".repeat(64)}`] as const) {
      expect(decodeHiveAgentRef(bad), bad).toBeUndefined();
    }
  });

  it("builds the card URL from the bridge URL and the Hive agent id", () => {
    expect(agentCardPath(7n)).toBe("/agents/7/card.json");
    expect(agentCardUrl("https://bridge.example.com/", 7n)).toBe("https://bridge.example.com/agents/7/card.json");
  });

  it("parses a card and turns ids into bigint", () => {
    expect(zAgentCard.parse(card).hive.agentId).toBe(7n);
    expect(zAgentCard.parse({ ...card, registrations: [{ agentId: "2142", agentRegistry: `eip155:10143:${erc8004Deployment.identityRegistry}` }] }).registrations[0]?.agentId).toBe(2142n);
  });

  it("rejects a card with a wrong type, a non-URL endpoint or x402 switched on", () => {
    expect(zAgentCard.safeParse({ ...card, type: "agent" }).success).toBe(false);
    expect(zAgentCard.safeParse({ ...card, services: [{ name: "MCP", endpoint: "bridge/mcp" }] }).success).toBe(false);
    expect(zAgentCard.safeParse({ ...card, x402Support: true }).success).toBe(false);
  });
});
