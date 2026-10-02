import { createPublicClient, http } from "viem";
import { monadTestnet } from "@hive/shared";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { SessionStore } from "./sessions.js";
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

const app = createApp({
  corsOrigins: config.corsOrigins,
  tokens: new TokenService(config.jwtSecret),
  // viem verifyMessage covers EOAs and ERC-1271 / 6492 smart accounts (the Kernel account in ADR-002).
  verifySignature: ({ owner, message, signature }) => rpc.verifyMessage({ address: owner as `0x${string}`, message, signature }),
  probes: {
    rpc: async () => (await rpc.getChainId()) === monadTestnet.id,
    // STUB: replace when Supabase lands (HF-2/3)
    supabase: async () => false,
  },
  sessions: new SessionStore(),
  // STUB: replace with the viem ChainReader once contracts are deployed (AK-7)
  chain: new InMemoryChain(),
  // STUB: replace with Supabase once HF-2/3 land
  store: new InMemoryCiphertextStore(),
});

app.listen(config.port, () => {
  console.log(`bridge listening on http://localhost:${config.port}`);
});
