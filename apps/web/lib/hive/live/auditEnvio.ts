import { HiveError } from "@hive/shared";
import type { AuditDeps } from "./audit";

const TIMEOUT_MS = 10_000;

function endpoint(): string {
  const url = process.env.NEXT_PUBLIC_ENVIO_URL;
  if (!url) throw new HiveError("INTERNAL", "NEXT_PUBLIC_ENVIO_URL is not set, so the app doesn't know where the audit indexer is.");
  return url;
}

/** GraphQL over fetch to the Envio indexer. Read-only and public: the indexed data is already onchain. */
export const envioAudit: AuditDeps = {
  async query<T>(gql: string, variables: Record<string, unknown>): Promise<T> {
    let res: Response;
    try {
      res = await fetch(endpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: gql, variables }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      if (e instanceof HiveError) throw e;
      throw new HiveError("INTERNAL", "The audit indexer is unreachable.");
    }
    if (!res.ok) throw new HiveError("INTERNAL", `The audit indexer answered ${res.status}.`);
    const body = (await res.json().catch(() => null)) as { data?: T; errors?: unknown[] } | null;
    if (!body?.data || body.errors?.length) throw new HiveError("INTERNAL", "The audit indexer sent an unexpected response.");
    return body.data;
  },
};
