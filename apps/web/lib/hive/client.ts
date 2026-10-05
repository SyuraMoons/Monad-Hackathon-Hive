import { HIVE_MODE } from "./mode";
import type { HiveClient } from "./types";

let client: Promise<HiveClient> | null = null;

/** The single HiveClient for this tab. The mock is loaded only in development, behind a dynamic import. */
export function getHiveClient(): Promise<HiveClient> {
  if (!client) {
    client =
      process.env.NODE_ENV !== "production" && HIVE_MODE === "mock"
        ? import("./mock").then((m) => m.createMockClient())
        : import("./live").then((m) => m.createLiveClient());
  }
  return client;
}

export { HIVE_MODE };
