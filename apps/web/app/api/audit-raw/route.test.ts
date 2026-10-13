import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const OWNER = "0xAbCdEf0123456789aBcDeF0123456789abcdef01";
const req = (q: string) => new Request(`http://x/api/audit-raw${q}`);

describe("GET /api/audit-raw", () => {
  beforeEach(() => { process.env.NEXT_PUBLIC_ENVIO_URL = "http://envio.test/graphql"; });
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.NEXT_PUBLIC_ENVIO_URL; });

  it("rejects a missing or malformed owner", async () => {
    expect((await GET(req(""))).status).toBe(400);
    expect((await GET(req("?owner=nope"))).status).toBe(400);
  });

  it("POSTs to the indexer with the lowercased owner and returns the rows", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { AuditEvent: [{ kind: "memory.written" }] } })));
    vi.stubGlobal("fetch", fetchMock);
    const res = await GET(req(`?owner=${OWNER}`));
    expect(res.status).toBe(200);
    expect((await res.json()).count).toBe(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body).variables.owner).toBe(OWNER.toLowerCase());
  });

  it("answers 502 when the indexer fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x", { status: 500 })));
    expect((await GET(req(`?owner=${OWNER}`))).status).toBe(502);
  });
});
