import type { HiveEvent } from "@hive/shared";
import { describe, expect, it, vi } from "vitest";
import type { BridgeStatus } from "../types";
import { createEventStream } from "./events";

type Fake = { onopen?: () => void; onmessage?: (m: { data: string }) => void; onerror?: () => void; readyState: number; close: ReturnType<typeof vi.fn> };

function setup(token: string | null = "user-token") {
  const sources: Fake[] = [];
  const urls: string[] = [];
  const subscribe = createEventStream({
    baseUrl: () => "http://bridge.test",
    token: () => token ?? undefined,
    open: (url) => {
      urls.push(url);
      const s: Fake = { readyState: 0, close: vi.fn() };
      sources.push(s);
      return s as never;
    },
  });
  const events: HiveEvent[] = [];
  const statuses: BridgeStatus[] = [];
  const stop = subscribe((e) => events.push(e), (s) => statuses.push(s));
  return { sources, urls, events, statuses, stop };
}

const connected = { id: "1", type: "agent.connected", at: 1_700_000_000, data: { agentId: "4" } };

describe("live event stream", () => {
  it("connects with the token in the query and reports open", () => {
    const t = setup("a b");
    expect(t.urls).toEqual(["http://bridge.test/v1/events?token=a%20b"]);
    expect(t.statuses).toEqual(["connecting"]);
    t.sources[0].onopen?.();
    expect(t.statuses).toEqual(["connecting", "open"]);
  });

  it("delivers a valid event with ids parsed to bigint", () => {
    const t = setup();
    t.sources[0].onmessage?.({ data: JSON.stringify(connected) });
    expect(t.events).toHaveLength(1);
    expect(t.events[0]).toMatchObject({ type: "agent.connected", data: { agentId: BigInt(4) } });
  });

  it("drops invalid payloads and non-JSON without throwing", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const t = setup();
    t.sources[0].onmessage?.({ data: "not json" });
    t.sources[0].onmessage?.({ data: JSON.stringify({ ...connected, type: "nope" }) });
    t.sources[0].onmessage?.({ data: JSON.stringify({ ...connected, data: { agentId: "-1" } }) });
    expect(t.events).toEqual([]);
    err.mockRestore();
  });

  it("reconnecting while the browser retries, offline once the source is closed", () => {
    const t = setup();
    t.sources[0].readyState = 0;
    t.sources[0].onerror?.();
    t.sources[0].readyState = 2;
    t.sources[0].onerror?.();
    expect(t.statuses.slice(1)).toEqual(["reconnecting", "offline"]);
  });

  it("is offline without opening anything when there is no token", () => {
    const t = setup(null);
    expect(t.sources).toHaveLength(0);
    expect(t.statuses).toEqual(["offline"]);
  });

  it("closes the source when unsubscribed", () => {
    const t = setup();
    t.stop();
    expect(t.sources[0].close).toHaveBeenCalledOnce();
  });
});
