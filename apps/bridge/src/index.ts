import { createPublicClient, http } from "viem";
import { monadTestnet } from "@hive/shared";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
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
  // STUB: replace with the viem ChainReader once contracts are deployed (AK-7)
  chain: new InMemoryChain(),
  store: supabase || new InMemoryCiphertextStore(),
});

app.listen(config.port, () => {
  console.log(`bridge listening on http://localhost:${config.port}`);
});
