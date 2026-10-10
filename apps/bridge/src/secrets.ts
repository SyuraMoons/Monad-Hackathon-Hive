// Refuses a session summary that looks like it carries a credential. Not a scanner: it only catches the obvious shapes.
// 0x + 64 hex (transaction and content hashes) is deliberately not matched.
const PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bsk-[A-Za-z0-9_-]{20,}/,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
];

export const looksLikeSecret = (text: string): boolean => PATTERNS.some((p) => p.test(text));
