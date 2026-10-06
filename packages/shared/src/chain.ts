export { monadTestnet } from "viem/chains";

/** Monad testnet explorer (rules A4). Every link the UI shows must open here (T8). */
export const EXPLORER_URL = "https://testnet.monadscan.com";

const trim = (base: string) => base.replace(/\/+$/, "");

export const explorerTxUrl = (hash: string, base: string = EXPLORER_URL) => `${trim(base)}/tx/${hash}`;
export const explorerAddressUrl = (address: string, base: string = EXPLORER_URL) => `${trim(base)}/address/${address}`;

const RATE_LIMIT_RETRIES = 4;
const RATE_LIMIT_BASE_MS = 300;

const RATE_LIMIT_CODES = new Set([-32011, -32007, 429]);

/** True when a JSON-RPC body (single or batch) holds a rate-limit error. Batches answer HTTP 200 with the error inside. */
async function isRateLimited(res: Response): Promise<boolean> {
  if (res.status === 429) return true;
  if (!res.ok) return false;
  try {
    const body: unknown = await res.clone().json();
    return (Array.isArray(body) ? body : [body]).some((r) => RATE_LIMIT_CODES.has((r as { error?: { code?: number } } | null)?.error?.code ?? 0));
  } catch {
    return false;
  }
}

/**
 * `fetch` for viem's `fetchFn`. The public Monad RPC limits bursts (HTTP 429, or a -32011 error inside a 200 batch
 * response) and viem does not retry that code, so the first limited read would fail the request. Retries those, then
 * hands back the last response unchanged so the caller reports the error as before.
 */
export async function rateLimitedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(input, init);
    if (attempt >= RATE_LIMIT_RETRIES || !(await isRateLimited(res))) return res;
    const retryAfter = Number(res.headers.get("retry-after"));
    const wait = retryAfter > 0 ? Math.min(retryAfter * 1000, 5000) : RATE_LIMIT_BASE_MS * 2 ** attempt * (0.75 + Math.random() / 2);
    await new Promise((r) => setTimeout(r, wait));
  }
}
