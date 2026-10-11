import { describe, expect, it } from "vitest";
import { agentConnection, CONNECTION_TEXT } from "./agentStatus";

const NOW = 1_000;

describe("agentConnection", () => {
  it("is connected once the agent has called a tool", () => {
    expect(agentConnection({ connected: true, tokenExpiresAt: NOW + 60 }, NOW)).toBe("connected");
  });

  it("is waiting when authorized with a live token but no call yet", () => {
    expect(agentConnection({ connected: false, tokenExpiresAt: NOW + 60 }, NOW)).toBe("waiting");
  });

  it("is none with no session or an expired token", () => {
    expect(agentConnection({ connected: false, tokenExpiresAt: null }, NOW)).toBe("none");
    expect(agentConnection({ connected: false, tokenExpiresAt: NOW }, NOW)).toBe("none");
    expect(agentConnection({ connected: false, tokenExpiresAt: NOW - 1 }, NOW)).toBe("none");
  });

  it("keeps the wording the canvas node already used", () => {
    expect(CONNECTION_TEXT.waiting).toBe("waiting for its first call");
  });
});
