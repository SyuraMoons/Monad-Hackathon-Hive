import { z } from "zod";

export const ERROR_CODES = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "INVALID_INPUT",
  "SESSION_EXPIRED",
  "CHAIN_ERROR",
  "STORAGE_ERROR",
  "RATE_LIMITED",
  "INTERNAL",
] as const;
export const zErrorCode = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof zErrorCode>;

/** `{ "error": { "code", "message" } }` on every non-2xx response. */
export const zErrorEnvelope = z.object({
  error: z.object({ code: zErrorCode, message: z.string() }),
});
export type ErrorEnvelope = z.infer<typeof zErrorEnvelope>;

export class HiveError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "HiveError";
    this.code = code;
  }
  toEnvelope(): ErrorEnvelope {
    return { error: { code: this.code, message: this.message } };
  }
}
