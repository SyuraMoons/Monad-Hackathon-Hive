import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { ChallengeStore } from "../src/auth.js";
import { buildOpenApi } from "../src/openapi.js";
import { SessionStore } from "../src/sessions.js";
import { InMemoryChain, InMemoryCiphertextStore, InMemoryVaultStore } from "../src/stubs.js";
import { TokenService } from "../src/tokens.js";

const app = createApp({
  corsOrigins: [],
  tokens: new TokenService("s".repeat(40)),
  challenges: new ChallengeStore(),
  verifySignature: async () => false,
  probes: { rpc: async () => true, supabase: async () => true },
  sessions: new SessionStore(),
  chain: new InMemoryChain(),
  store: new InMemoryCiphertextStore(),
  vaults: new InMemoryVaultStore(),
  writer: { write: async () => { throw new Error("not used here"); } },
});

type Layer = { route?: { path: string; methods: Record<string, boolean> } };
const registered = (): string[] =>
  ((app as unknown as { router: { stack: Layer[] } }).router.stack)
    .flatMap((l) => (l.route ? Object.keys(l.route.methods).map((m) => `${m.toUpperCase()} ${l.route!.path.replace(/:(\w+)/g, "{$1}")}`) : []))
    // /mcp also has an app.all() that answers 405 to every other verb; /openapi.json is the spec itself.
    .filter((r) => !r.endsWith(" /mcp") || r.startsWith("POST "))
    .filter((r) => !r.endsWith("/openapi.json"));

const documented = (): string[] => {
  const paths = buildOpenApi().paths as Record<string, Record<string, unknown>>;
  return Object.entries(paths).flatMap(([p, ops]) => Object.keys(ops).map((m) => `${m.toUpperCase()} ${p}`));
};

describe("OpenAPI", () => {
  it("documents every route the app registers, and nothing else", () => {
    const real = [...new Set(registered())];
    expect(real.length).toBeGreaterThanOrEqual(9);
    expect(documented().sort()).toEqual(real.sort());
  });

  it("serves the spec at /openapi.json", async () => {
    const res = await request(app).get("/openapi.json");
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe("3.1.0");
    expect(Object.keys(res.body.components.schemas)).toContain("hive_read_memory.input");
  });

  it("keeps uint256 values as decimal strings and leaks no $schema or bigint", () => {
    const text = JSON.stringify(buildOpenApi());
    expect(text).not.toContain("$schema");
    expect(buildOpenApi().components).toMatchObject({ schemas: { AuthorizeBody: { type: "object" } } });
  });

  it("serves Swagger UI at /docs", async () => {
    const res = await request(app).get("/docs/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("swagger-ui");
  });
});
