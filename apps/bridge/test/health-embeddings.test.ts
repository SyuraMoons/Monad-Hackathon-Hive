import request from "supertest";
import { describe, expect, it } from "vitest";
import { zHealthResponse } from "@hive/shared";
import { createApp } from "../src/app.js";
import { SessionStore } from "../src/sessions.js";
import { InMemoryChain, InMemoryCiphertextStore, InMemoryVaultStore, InMemoryVectorStore } from "../src/stubs.js";
import { TokenService } from "../src/tokens.js";
import { FakeEmbedder } from "./helpers/fakeEmbedder.js";

const app = (embedder?: FakeEmbedder) =>
  createApp({
    corsOrigins: [],
    tokens: new TokenService("s".repeat(40)),
    verifySignature: async () => false,
    probes: { rpc: async () => true, supabase: async () => true },
    sessions: new SessionStore(),
    chain: new InMemoryChain(),
    store: new InMemoryCiphertextStore(),
    vaults: new InMemoryVaultStore(),
    writer: { write: async () => { throw new Error("not used here"); } },
    embeddings: embedder && { embedder, vectors: new InMemoryVectorStore(), minSimilarity: 0.8 },
  });

describe("/health embeddings", () => {
  it("says off when search by meaning is not configured", async () => {
    const res = await request(app()).get("/health");
    expect(zHealthResponse.parse(res.body).embeddings).toBe("off");
  });

  it.each(["loading", "ready", "error"] as const)("reports the model as %s", async (state) => {
    const embedder = new FakeEmbedder();
    embedder.state = state;
    const res = await request(app(embedder)).get("/health");
    expect(zHealthResponse.parse(res.body).embeddings).toBe(state);
  });
});
