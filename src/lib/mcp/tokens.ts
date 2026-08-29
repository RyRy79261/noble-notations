/**
 * Token primitives.
 *
 * Auth codes, access tokens, refresh tokens and client secrets are opaque
 * random strings. Only SHA-256 hashes are persisted — the plaintext exists in
 * the response body to the client and in subsequent Authorization headers,
 * never at rest.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function generateOpaqueToken(prefix: string, bytes = 32): string {
  return `${prefix}_${randomBytes(bytes).toString('base64url')}`;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time comparison of two hex-encoded SHA-256 digests. */
export function hashesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** PKCE S256: code_challenge === base64url(sha256(code_verifier)). */
export function verifyPkceS256(verifier: string, challenge: string): boolean {
  const computed = createHash('sha256').update(verifier).digest('base64url');
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const TOKEN_PREFIX = {
  ACCESS: 'mcp_at',
  REFRESH: 'mcp_rt',
  AUTH_CODE: 'mcp_ac',
  CLIENT_ID: 'mcp_client',
  CLIENT_SECRET: 'mcp_secret',
} as const;

export const TOKEN_TTL = {
  AUTH_CODE_MS: 10 * 60_000,
  ACCESS_TOKEN_MS: 24 * 60 * 60_000,
  REFRESH_TOKEN_MS: 30 * 24 * 60 * 60_000,
} as const;
