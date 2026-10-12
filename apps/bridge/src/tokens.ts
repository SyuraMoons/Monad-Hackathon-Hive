import { HiveError, zAddress } from "@hive/shared";
import { jwtVerify, SignJWT } from "jose";

export const USER_TOKEN_TTL_S = 24 * 60 * 60;
const CLIENT_TTL_S = 365 * 24 * 60 * 60;

export type UserClaims = { owner: string; expiresAt: number };
export type AgentClaims = { agentId: bigint; owner: string; expiresAt: number };

/** HS256, 24 h, `{ sub: owner, typ: "user" }`. */
export class TokenService {
  private key: Uint8Array;
  constructor(secret: string, private now: () => number = () => Math.floor(Date.now() / 1000)) {
    this.key = new TextEncoder().encode(secret);
  }

  async signUser(owner: string): Promise<{ token: string; expiresAt: number }> {
    const iat = this.now();
    const expiresAt = iat + USER_TOKEN_TTL_S;
    const token = await new SignJWT({ typ: "user" }).setProtectedHeader({ alg: "HS256" }).setSubject(owner).setIssuedAt(iat).setExpirationTime(expiresAt).sign(this.key);
    return { token, expiresAt };
  }

  /** Throws `HiveError("UNAUTHORIZED" | "SESSION_EXPIRED")`. Only HS256 is accepted. */
  async verifyUser(token: string): Promise<UserClaims> {
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ["HS256"], currentDate: new Date(this.now() * 1000) });
      if (payload.typ !== "user" || !payload.sub) throw new HiveError("UNAUTHORIZED", "Not a user token.");
      return { owner: zAddress.parse(payload.sub), expiresAt: payload.exp ?? 0 };
    } catch (e) {
      if (e instanceof HiveError) throw e;
      if (e instanceof Error && e.name === "JWTExpired") throw new HiveError("SESSION_EXPIRED", "Session expired. Sign in again.");
      throw new HiveError("UNAUTHORIZED", "Invalid token.");
    }
  }

  /** Agent tokens carry `{ sub: agentId, owner, typ: "agent" }`. The caller's identity always comes from here, never from a tool argument. */
  async signAgent(agentId: bigint, owner: string): Promise<{ token: string; expiresAt: number }> {
    const iat = this.now();
    const expiresAt = iat + USER_TOKEN_TTL_S;
    const token = await new SignJWT({ typ: "agent", owner }).setProtectedHeader({ alg: "HS256" }).setSubject(agentId.toString()).setIssuedAt(iat).setExpirationTime(expiresAt).sign(this.key);
    return { token, expiresAt };
  }

  async verifyAgent(token: string): Promise<AgentClaims> {
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ["HS256"], currentDate: new Date(this.now() * 1000) });
      if (payload.typ !== "agent" || !payload.sub || typeof payload.owner !== "string") throw new HiveError("UNAUTHORIZED", "Not an agent token.");
      return { agentId: BigInt(payload.sub), owner: zAddress.parse(payload.owner), expiresAt: payload.exp ?? 0 };
    } catch (e) {
      if (e instanceof HiveError) throw e;
      if (e instanceof Error && e.name === "JWTExpired") throw new HiveError("SESSION_EXPIRED", "Agent session expired. Authorize the agent again.");
      throw new HiveError("UNAUTHORIZED", "Invalid token.");
    }
  }

  /**
   * A dynamically registered OAuth client is a signed `client_id` that carries its redirect URIs, so registering stores nothing
   * and survives a restart (`typ: "client"`, never accepted as a user or agent token).
   */
  async signClient(redirectUris: string[]): Promise<string> {
    const iat = this.now();
    return new SignJWT({ typ: "client", redirect_uris: redirectUris }).setProtectedHeader({ alg: "HS256" }).setIssuedAt(iat).setExpirationTime(iat + CLIENT_TTL_S).sign(this.key);
  }

  /** The registered redirect URIs, or `undefined` for anything that is not a live client id. */
  async verifyClient(clientId: string): Promise<string[] | undefined> {
    try {
      const { payload } = await jwtVerify(clientId, this.key, { algorithms: ["HS256"], currentDate: new Date(this.now() * 1000) });
      const uris = payload.redirect_uris;
      if (payload.typ !== "client" || !Array.isArray(uris) || !uris.every((u) => typeof u === "string")) return undefined;
      return uris as string[];
    } catch {
      return undefined;
    }
  }
}
