import { createPublicClient, http } from "viem";
import { monadTestnet } from "@hive/shared";
import { createApp } from "./app.js";
import { ViemChainReader } from "./chain.js";
import { loadConfig } from "./config.js";
import { noGasFunder, viemGasFunder } from "./funder.js";
import { SessionStore } from "./sessions.js";
import { SupabaseCiphertextStore } from "./store.js";
import { InMemoryChain, InMemoryCiphertextStore } from "./stubs.js";
import { TokenService } from "./tokens.js";

// The repo-root .env (src/ and dist/ are both three levels down). Variables already set win.
try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url));
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
}

const config = loadConfig();
const rpc = createPublicClient({ chain: monadTestnet, transport: http(config.rpcUrl) });
const supabase = config.supabase && new SupabaseCiphertextStore(config.supabase.url, config.supabase.serviceKey);
if (!supabase) console.warn("bridge: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY unset, memory is kept in this process only");

if (!config.funderKey) console.warn("bridge: BRIDGE_FUNDER_PRIVATE_KEY unset, agent keys will not be topped up with gas");

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
  funder: config.funderKey ? viemGasFunder(rpc, config.rpcUrl, config.funderKey) : noGasFunder,
  publicUrl: config.publicUrl,
});

app.listen(config.port, () => {
  console.log(`bridge listening on http://localhost:${config.port}`);
});
