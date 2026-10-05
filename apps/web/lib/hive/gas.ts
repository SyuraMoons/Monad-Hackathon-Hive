import type { Account, Address, Chain, Client, Hex, Transport } from "viem";
import { estimateGas } from "viem/actions";

const DEFAULT_GAS_MULTIPLIER = 1.1;

// Conservative fallbacks measured on Monad testnet, used only when the RPC
// estimate fails. Recalibrate with a funded key before the demo. Every write
// carries an explicit gas limit (rule 5) — Monad charges the declared limit,
// not the gas actually used.
export const GAS_FALLBACKS = {
  register: BigInt(300_000),
  setAgentWriter: BigInt(120_000),
  addEdge: BigInt(300_000),
  removeEdge: BigInt(120_000),
  write: BigInt(400_000),
};

export function gasMultiplier(): number {
  const raw = Number(process.env.NEXT_PUBLIC_HIVE_GAS_MULTIPLIER);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_GAS_MULTIPLIER;
}

function applyBuffer(gas: bigint): bigint {
  return (gas * BigInt(Math.round(gasMultiplier() * 100))) / BigInt(100);
}

// Estimates gas for a write and adds the configured buffer, falling back to an
// explicit constant when estimation throws. A write must never go out without
// an explicit gas limit.
export async function bufferedGas(
  client: Client<Transport, Chain, Account>,
  to: Address,
  data: Hex,
  fallback: bigint,
): Promise<bigint> {
  try {
    const estimate = await estimateGas(client, { account: client.account, to, data });
    return applyBuffer(estimate);
  } catch {
    return fallback;
  }
}
