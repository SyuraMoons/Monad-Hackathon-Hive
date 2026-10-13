import { AUDIT_FIELDS, AUDIT_LIMIT } from "@/lib/hive/live/audit";

/**
 * The "Open the raw events on Envio" link lands here. The Envio GraphQL endpoint only answers POST, so opening it in
 * a browser (GET) shows PersistedQueryNotSupported. This reads the same public, onchain-derived rows and shows them as JSON.
 */
const QUERY = `query Raw($owner: String!, $limit: Int!) {
  AuditEvent(where: { owner: { _eq: $owner } }, order_by: [{ block: desc }, { logIndex: desc }], limit: $limit) { ${AUDIT_FIELDS} }
}`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

export async function GET(req: Request): Promise<Response> {
  const owner = new URL(req.url).searchParams.get("owner") ?? "";
  if (!/^0x[0-9a-fA-F]{40}$/.test(owner)) return json({ error: "Pass ?owner=0x… (your address)." }, 400);
  const endpoint = process.env.NEXT_PUBLIC_ENVIO_URL;
  if (!endpoint) return json({ error: "The audit indexer is not configured." }, 503);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { owner: owner.toLowerCase(), limit: AUDIT_LIMIT } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return json({ error: `The audit indexer answered ${res.status}.` }, 502);
    const body = (await res.json()) as { data?: { AuditEvent?: unknown[] }; errors?: unknown[] };
    if (!body.data?.AuditEvent || body.errors?.length) return json({ error: "The audit indexer sent an unexpected response." }, 502);
    return json({ source: "Envio HyperIndex, Monad testnet", owner: owner.toLowerCase(), count: body.data.AuditEvent.length, events: body.data.AuditEvent });
  } catch {
    return json({ error: "The audit indexer is unreachable." }, 502);
  }
}
