import { describe, expect, it } from "vitest";
import {
  explorerAddressUrl,
  explorerTxUrl,
  HiveError,
  topicFromBytes32,
  topicToBytes32,
  zAddress,
  zAgentId,
  zContentHash,
  zEdgeId,
  zErrorEnvelope,
  zTopic,
} from "../src/index.js";

const HASH = "0x" + "4f1c".repeat(16);

describe("ids", () => {
  it("parses uint256 decimal strings to bigint", () => {
    expect(zAgentId.parse("1")).toBe(1n);
    expect(zEdgeId.parse((2n ** 256n - 1n).toString())).toBe(2n ** 256n - 1n);
  });

  it("rejects non-canonical or out-of-range uint256", () => {
    for (const bad of ["", "01", "-1", "1.5", "0x1", (2n ** 256n).toString()]) {
      expect(zEdgeId.safeParse(bad).success, bad).toBe(false);
    }
    expect(zAgentId.safeParse(1).success).toBe(false);
  });

  it("accepts topic slugs and rejects everything else", () => {
    expect(zTopic.parse("work")).toBe("work");
    expect(zTopic.parse("test-01")).toBe("test-01");
    for (const bad of ["", "Work", "per sonal", "a".repeat(32), "émoji"]) {
      expect(zTopic.safeParse(bad).success, bad).toBe(false);
    }
  });

  it("round-trips a topic through bytes32", () => {
    const t = zTopic.parse("research");
    const b = topicToBytes32(t);
    expect(b).toMatch(/^0x[0-9a-f]{64}$/);
    expect(topicFromBytes32(b)).toBe("research");
  });

  it("normalises content hashes to lowercase and rejects wrong lengths", () => {
    expect(zContentHash.parse(HASH.toUpperCase().replace("0X", "0x"))).toBe(HASH);
    expect(zContentHash.safeParse("0x1234").success).toBe(false);
  });

  it("checksums addresses and rejects junk", () => {
    expect(zAddress.parse("0x7f3a00000000000000000000000000000000c21e")).toBe("0x7f3a00000000000000000000000000000000C21e");
    expect(zAddress.safeParse("0x7f3a").success).toBe(false);
  });
});

describe("errors", () => {
  it("builds and validates the error envelope", () => {
    const env = new HiveError("SESSION_EXPIRED", "Sign in again").toEnvelope();
    expect(zErrorEnvelope.parse(env)).toEqual(env);
    expect(zErrorEnvelope.safeParse({ error: { code: "TEAPOT", message: "" } }).success).toBe(false);
  });
});

describe("chain", () => {
  it("links to Monadscan", () => {
    expect(explorerTxUrl(HASH)).toBe(`https://testnet.monadscan.com/tx/${HASH}`);
    expect(explorerAddressUrl("0xabc", "https://testnet.monadscan.com/")).toBe("https://testnet.monadscan.com/address/0xabc");
  });
});
