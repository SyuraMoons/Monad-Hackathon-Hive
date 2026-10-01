import { createPublicClient, http } from "viem";
import { monadTestnet } from "@hive/shared";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { TokenService } from "./tokens.js";

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
  // STUB: replace when agent sessions land
  activeSessions: () => 0,
});

app.listen(config.port, () => {
  console.log(`bridge listening on http://localhost:${config.port}`);
});
