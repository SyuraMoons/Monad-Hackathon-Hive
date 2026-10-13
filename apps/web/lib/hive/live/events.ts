import { zHiveEvent } from "@hive/shared";
import type { HiveClient } from "../types";

// The bridge's SSE stream (GET /v1/events). EventSource can't send headers, so the user token goes in the query.
// Every message is checked against zHiveEvent: an invalid one is dropped, never shown.

type Source = Pick<EventSource, "close" | "readyState" | "onopen" | "onmessage" | "onerror">;
type SourceFactory = (url: string) => Source;

const CLOSED = 2;

export function createEventStream(opts: {
  baseUrl: () => string;
  token: () => string | undefined;
  /** Replaced in tests. */
  open?: SourceFactory;
}): HiveClient["events"]["subscribe"] {
  const open: SourceFactory = opts.open ?? ((url) => new EventSource(url));

  return (onEvent, onStatus) => {
    const token = opts.token();
    if (!token) {
      onStatus?.("offline");
      return () => {};
    }
    onStatus?.("connecting");
    let source: Source;
    try {
      source = open(`${opts.baseUrl()}/v1/events?token=${encodeURIComponent(token)}`);
    } catch {
      onStatus?.("offline");
      return () => {};
    }
    source.onopen = () => onStatus?.("open");
    source.onmessage = (message) => {
      let wire: unknown;
      try {
        wire = JSON.parse(message.data);
      } catch {
        return;
      }
      const parsed = zHiveEvent.safeParse(wire);
      if (parsed.success) onEvent(parsed.data);
      else console.error("[hive] dropped an invalid bridge event");
    };
    // The browser retries a dropped connection by itself (sending Last-Event-ID). A closed source is final, e.g. a 401.
    source.onerror = () => onStatus?.(source.readyState === CLOSED ? "offline" : "reconnecting");
    return () => source.close();
  };
}
