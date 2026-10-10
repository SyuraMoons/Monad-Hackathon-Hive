import { describe, expect, it } from "vitest";
import { looksLikeSecret } from "../src/secrets.js";

describe("looksLikeSecret", () => {
  it("catches a private key block, an sk- key and a JWT", () => {
    expect(looksLikeSecret("-----BEGIN PRIVATE KEY-----\nabc")).toBe(true);
    expect(looksLikeSecret("-----BEGIN RSA PRIVATE KEY-----")).toBe(true);
    expect(looksLikeSecret("key is sk-" + "x".repeat(24))).toBe(true);
    expect(looksLikeSecret("Bearer eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4")).toBe(true);
  });

  it("lets ordinary notes, transaction hashes and short sk- words through", () => {
    expect(looksLikeSecret("Decided on Postgres. Edge 3 is live.")).toBe(false);
    expect(looksLikeSecret("tx 0x" + "9a2e".repeat(16))).toBe(false);
    expect(looksLikeSecret("the sk-learn model, see disk-usage")).toBe(false);
  });
});
