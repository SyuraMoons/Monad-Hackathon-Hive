import { monadTestnet } from "@hive/shared";
import { createWalletClient, http, parseEther, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ADR-007: the agent key sends MemorySlots.write, so the bridge keeps it topped up with testnet MON.
export const MIN_BALANCE = parseEther("0.05");
export const TOP_UP = parseEther("0.1");
export const AGENT_CAP = parseEther("0.2");
export const OWNER_DAILY_CAP = parseEther("0.5");
const DAY_S = 24 * 60 * 60;
/** A plain MON transfer to an EOA. Monad charges the declared limit, so declare exactly this. */
const TRANSFER_GAS = 21_000n;

export type FundResult = "funded" | "enough" | "capped" | "disabled";

export interface GasFunder {
  ensureFunded(owner: string, agent: Hex): Promise<FundResult>;
}

/** Used when BRIDGE_FUNDER_PRIVATE_KEY is unset: agents then need MON from the faucet. */
export const noGasFunder: GasFunder = { ensureFunded: async () => "disabled" };

type Deps = {
  getBalance: (address: Hex) => Promise<bigint>;
  /** Sends the transfer and resolves once it is mined, so the first write finds the balance. */
  send: (to: Hex, value: bigint) => Promise<void>;
  now?: () => number;
};

/**
 * Limits what a drained or abused funder key can lose: at most AGENT_CAP per agent key, and OWNER_DAILY_CAP per owner per 24 h.
 * Counters live in memory, so a restart resets them. Spend is reserved before sending, which keeps parallel calls inside the caps.
 */
export class ViemGasFunder implements GasFunder {
  private byAgent = new Map<string, bigint>();
  private byOwner = new Map<string, { start: number; total: bigint }>();
  private now: () => number;

  constructor(private deps: Deps) {
    this.now = deps.now ?? (() => Math.floor(Date.now() / 1000));
  }

  async ensureFunded(owner: string, agent: Hex): Promise<FundResult> {
    if ((await this.deps.getBalance(agent)) >= MIN_BALANCE) return "enough";

    const agentKey = agent.toLowerCase();
    const spent = this.byAgent.get(agentKey) ?? 0n;
    if (spent + TOP_UP > AGENT_CAP) return "capped";

    const ownerKey = owner.toLowerCase();
    let window = this.byOwner.get(ownerKey);
    if (!window || this.now() - window.start >= DAY_S) {
      window = { start: this.now(), total: 0n };
      this.byOwner.set(ownerKey, window);
    }
    if (window.total + TOP_UP > OWNER_DAILY_CAP) return "capped";

    this.byAgent.set(agentKey, spent + TOP_UP);
    window.total += TOP_UP;
    try {
      await this.deps.send(agent, TOP_UP);
    } catch (e) {
      this.byAgent.set(agentKey, (this.byAgent.get(agentKey) ?? TOP_UP) - TOP_UP);
      window.total -= TOP_UP;
      throw e;
    }
    return "funded";
  }
}

export function viemGasFunder(rpc: Pick<PublicClient, "getBalance" | "waitForTransactionReceipt">, rpcUrl: string, funderKey: Hex): GasFunder {
  const wallet = createWalletClient({ account: privateKeyToAccount(funderKey), chain: monadTestnet, transport: http(rpcUrl) });
  return new ViemGasFunder({
    getBalance: (address) => rpc.getBalance({ address }),
    send: async (to, value) => {
      const hash = await wallet.sendTransaction({ to, value, gas: TRANSFER_GAS });
      await rpc.waitForTransactionReceipt({ hash });
    },
  });
}
