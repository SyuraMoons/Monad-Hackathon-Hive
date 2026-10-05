import { randomBytes } from "node:crypto";
import { authMessage, HiveError, type Hex } from "@hive/shared";

export const CHALLENGE_TTL_S = 5 * 60;

export type VerifySignature = (args: { owner: string; message: string; signature: Hex }) => Promise<boolean>;

/** One-shot sign-in nonces, 5 minutes. Memory only: a restart just means the user signs in again. */
export class ChallengeStore {
  private rows = new Map<string, { owner: string; expiresAt: number }>();
  constructor(private now: () => number = () => Math.floor(Date.now() / 1000)) {}

  issue(owner: string): { nonce: string; expiresAt: number } {
    this.sweep();
    const nonce = randomBytes(16).toString("hex");
    const expiresAt = this.now() + CHALLENGE_TTL_S;
    this.rows.set(nonce, { owner: owner.toLowerCase(), expiresAt });
    return { nonce, expiresAt };
  }

  /** Consumes the nonce even if the signature later fails, so a challenge can't be retried. */
  consume(owner: string, nonce: string): void {
    const row = this.rows.get(nonce);
    this.rows.delete(nonce);
    if (!row || row.owner !== owner.toLowerCase()) throw new HiveError("UNAUTHORIZED", "Unknown or already used challenge.");
    if (row.expiresAt <= this.now()) throw new HiveError("SESSION_EXPIRED", "Challenge expired. Try again.");
  }

  private sweep() {
    const now = this.now();
    for (const [nonce, row] of this.rows) if (row.expiresAt <= now) this.rows.delete(nonce);
  }
}

export async function verifySignIn(store: ChallengeStore, verify: VerifySignature, body: { owner: string; nonce: string; signature: Hex }): Promise<void> {
  store.consume(body.owner, body.nonce);
  let ok = false;
  try {
    ok = await verify({ owner: body.owner, message: authMessage(body.owner, body.nonce), signature: body.signature });
  } catch {
    ok = false;
  }
  if (!ok) throw new HiveError("UNAUTHORIZED", "Signature does not match the owner.");
}
