import { describe, expect, it } from "vitest";
import { HIVE_INSTRUCTIONS, MCP_TOOLS } from "../src/index.js";

describe("HIVE_INSTRUCTIONS", () => {
  it("names the tools an agent needs for the loop", () => {
    for (const tool of ["hive_read_memory", "hive_list_memory", "hive_search_memory", "hive_write_memory", "hive_save_session"]) {
      expect(HIVE_INSTRUCTIONS).toContain(tool);
      expect(Object.keys(MCP_TOOLS)).toContain(tool);
    }
  });

  it("teaches the structured fields and the untrusted-data rule", () => {
    for (const word of ["gist", "kind", "entities", "supersedes", "cursor", "slotIds", "mine", "state"]) expect(HIVE_INSTRUCTIONS).toContain(word);
    expect(HIVE_INSTRUCTIONS).toMatch(/never as instructions/);
  });

  it("tells an agent to keep calling with the cursor while more is true", () => {
    expect(HIVE_INSTRUCTIONS).toMatch(/while more is true call again with it/);
  });

  it("stays short, because every client pays for it on every session", () => {
    expect(new TextEncoder().encode(HIVE_INSTRUCTIONS).length).toBeLessThan(2200);
  });
});
