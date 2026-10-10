import { createPublicClient, http } from "viem";
import { monadTestnet, rateLimitedFetch } from "@hive/shared";
import { createApp } from "./app.js";
import { TransformersEmbedder } from "./embedder.js";
import { ViemChainReader, viemChainWriter } from "./chain.js";
import { loadConfig } from "./config.js";
import { noGasFunder, viemGasFunder } from "./funder.js";
import { SessionStore } from "./sessions.js";
import { SupabaseCiphertextStore } from "./store.js";
import { InMemoryChain, InMemoryCiphertextStore, InMemoryVaultStore, InMemoryVectorStore } from "./stubs.js";
import { TokenService } from "./tokens.js";
import { SupabaseVaultStore } from "./vaults.js";
import { SupabaseVectorStore } from "./vectors.js";

// The repo-root .env (src/ and dist/ are both three levels down). Variables already set win.
try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url));
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
}

const config = loadConfig();
const rpc = createPublicClient({ chain: monadTestnet, transport: http(config.rpcUrl, { batch: true, fetchFn: rateLimitedFetch }) });
const supabase = config.supabase && new SupabaseCiphertextStore(config.supabase.url, config.supabase.serviceKey);
if (!supabase) console.warn("bridge: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY unset, memory is kept in this process only");

if (!config.funderKey) console.warn("bridge: BRIDGE_FUNDER_PRIVATE_KEY unset, agent keys will not be topped up with gas");

// Search by meaning (ADR-022). The model loads in the background: until it is ready, search ranks on words only.
const embedder = config.embeddings.enabled ? new TransformersEmbedder(config.embeddings.model, config.embeddings.cacheDir) : undefined;
if (embedder) void embedder.load();
if (embedder && !config.supabase) console.warn("bridge: embeddings are on without Supabase, vectors are kept in this process only");

const app = createApp({
  corsOrigins: config.corsOrigins,
  tokens: new TokenService(config.jwtSecret),
  // viem verifyMessage covers EOAs and ERC-1271 / 6492 smart accounts (the Kernel account in ADR-002).
  verifySignature: ({ owner, message, signature }) => rpc.verifyMessage({ address: owner as `0x${string}`, message, signature }),
  probes: {
    rpc: async () => (await rpc.getChainId()) === monadTestnet.id,
    supabase: async () => (supabase ? supabase.reachable() : false),
  },
  sessions: new SessionStore(),
  // BRIDGE_CHAIN=memory keeps the in-process chain for offline dev. Default is live Monad testnet.
  chain: process.env.BRIDGE_CHAIN === "memory" ? new InMemoryChain() : new ViemChainReader(rpc),
  store: supabase || new InMemoryCiphertextStore(),
  vaults: config.supabase ? new SupabaseVaultStore(config.supabase.url, config.supabase.serviceKey) : new InMemoryVaultStore(),
  writer: viemChainWriter(rpc, config.rpcUrl),
  funder: config.funderKey ? viemGasFunder(rpc, config.rpcUrl, config.funderKey) : noGasFunder,
  embeddings: embedder && {
    embedder,
    vectors: config.supabase ? new SupabaseVectorStore(config.supabase.url, config.supabase.serviceKey) : new InMemoryVectorStore(),
    minSimilarity: config.embeddings.minSimilarity,
  },
  publicUrl: config.publicUrl,
  webUrl: config.webUrl,
});

app.listen(config.port, () => {
  console.log(`bridge listening on http://localhost:${config.port}`);
});
