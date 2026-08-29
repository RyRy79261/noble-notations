import 'server-only';

/**
 * Administrator identity.
 *
 * The OAuth authorize endpoint has to know *who* is approving a connector
 * before it will mint an authorization code. This repository has exactly one
 * author, so identity here is a single password-gated session rather than a
 * full auth provider — no Google Cloud OAuth client, no external console to
 * configure, nothing to provision before the connector works.
 *
 * The OAuth 2.1 + DCR + PKCE flow that claude.ai actually requires is
 * unaffected: this module only answers "is a human administrator present?".
 * Swapping in a real identity provider later means reimplementing
 * `getAdminUser()` and the sign-in form; nothing else in the OAuth stack
 * looks at how the answer was obtained.
 *
 * The session cookie is an HMAC-signed, expiring bearer of the claim
 * "administrator". It is HttpOnly, SameSite=Lax (the OAuth return trip is a
 * top-level GET navigation, which Lax permits) and Secure outside dev.
 */
import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'nn_admin';
export const ADMIN_USER_ID = 'admin';

const SESSION_TTL_MS = 12 * 60 * 60_000;

interface SessionPayload {
  sub: string;
  exp: number;
}

function sessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'ADMIN_SESSION_SECRET is missing or shorter than 32 characters. ' +
        'Generate one with: openssl rand -base64 48',
    );
  }
  return secret;
}

function sign(data: string): string {
  return createHmac('sha256', sessionSecret()).update(data).digest('base64url');
}

export function mintSessionToken(ttlMs = SESSION_TTL_MS): string {
  const payload: SessionPayload = {
    sub: ADMIN_USER_ID,
    exp: Date.now() + ttlMs,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const provided = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(body));
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as SessionPayload;
    if (payload.exp < Date.now()) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

/**
 * Verify a password against ADMIN_PASSWORD_HASH.
 *
 * Format: `scrypt$N$r$p$salt-b64$hash-b64`, produced by
 * scripts/hash-password.ts. Self-describing so the verifier never has to
 * assume the cost parameters a hash was made with.
 */
export function verifyAdminPassword(password: string): boolean {
  const stored = process.env.ADMIN_PASSWORD_HASH?.trim();
  if (!stored) return false;

  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }

  try {
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    // `maxmem` must be raised explicitly: node's 32 MB default rejects
    // N=16384, r=8 outright rather than running slowly.
    const actual = scryptSync(password, salt, expected.length, {
      N,
      r,
      p,
      maxmem: 256 * 1024 * 1024,
    });
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  } catch {
    return false;
  }
}

/** True when the admin gate is configured at all. */
export function isAdminConfigured(): boolean {
  return Boolean(
    process.env.ADMIN_PASSWORD_HASH?.trim() &&
    process.env.ADMIN_SESSION_SECRET?.trim(),
  );
}

/** The signed-in administrator, or null. Reads the request's cookies. */
export async function getAdminUser(): Promise<{ userId: string } | null> {
  try {
    const store = await cookies();
    const sub = verifySessionToken(store.get(SESSION_COOKIE)?.value);
    return sub ? { userId: sub } : null;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    // Lax rather than Strict: the OAuth authorize return trip is a top-level
    // GET navigation from the sign-in page, which Strict would strip.
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}
