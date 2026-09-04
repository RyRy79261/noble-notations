import 'server-only';

/**
 * OAuth 2.1 + Dynamic Client Registration for the MCP connector.
 *
 * Implements the slices of RFC 6749 / 7591 / 7636 that claude.ai's connector
 * UI actually exercises. Identity is delegated to the administrator session
 * (see admin-session.ts) — this module only mints and validates tokens for a
 * principal the authorize endpoint has already verified.
 *
 * Every statement here is a single query: the Neon HTTP driver has no
 * transaction support, so multi-statement atomicity is achieved by putting
 * all the validation predicates into one statement's WHERE clause rather
 * than by wrapping reads and writes together.
 */
import { and, eq, gte, isNull, lt } from 'drizzle-orm';
import { db } from '@/db/client';
import { mcpAccessTokens, mcpAuthCodes, mcpOauthClients } from '@/db/schema';
import {
  generateOpaqueToken,
  hashToken,
  hashesEqual,
  TOKEN_PREFIX,
  TOKEN_TTL,
  verifyPkceS256,
} from '@/lib/mcp/tokens';

export interface RegisteredClient {
  clientId: string;
  clientSecret?: string;
  clientName: string;
  redirectUris: string[];
  tokenEndpointAuthMethod:
    'none' | 'client_secret_basic' | 'client_secret_post';
  scope: string | null;
  createdAt: number;
}

export interface RegisterInput {
  clientName: string;
  redirectUris: string[];
  tokenEndpointAuthMethod:
    'none' | 'client_secret_basic' | 'client_secret_post';
  scope?: string | undefined;
}

/**
 * DCR is unauthenticated by design (RFC 7591), so the redirect URI is the
 * only thing standing between a stranger's registration and a harvested
 * authorization code. Restrict it to claude.ai/anthropic.com and loopback.
 */
export function isAllowedRedirectUri(uri: string): boolean {
  try {
    const u = new URL(uri);
    const isLoopback =
      u.hostname === 'localhost' ||
      u.hostname === '127.0.0.1' ||
      u.hostname === '[::1]';

    if (isLoopback) return u.protocol === 'http:' || u.protocol === 'https:';
    if (u.protocol !== 'https:') return false;

    return (
      u.hostname === 'claude.ai' ||
      u.hostname.endsWith('.claude.ai') ||
      u.hostname === 'anthropic.com' ||
      u.hostname.endsWith('.anthropic.com')
    );
  } catch {
    return false;
  }
}

export async function registerClient(
  input: RegisterInput,
): Promise<RegisteredClient> {
  for (const uri of input.redirectUris) {
    if (!isAllowedRedirectUri(uri)) {
      throw new Error(`redirect_uri not allowed: ${uri}`);
    }
  }

  const clientId = generateOpaqueToken(TOKEN_PREFIX.CLIENT_ID, 16);
  const isConfidential = input.tokenEndpointAuthMethod !== 'none';
  const clientSecret = isConfidential
    ? generateOpaqueToken(TOKEN_PREFIX.CLIENT_SECRET, 32)
    : undefined;

  const createdAt = Date.now();
  await db.insert(mcpOauthClients).values({
    clientId,
    clientSecretHash: clientSecret ? hashToken(clientSecret) : null,
    clientName: input.clientName,
    redirectUris: input.redirectUris,
    tokenEndpointAuthMethod: input.tokenEndpointAuthMethod,
    scope: input.scope ?? null,
    createdAt,
  });

  return {
    clientId,
    ...(clientSecret ? { clientSecret } : {}),
    clientName: input.clientName,
    redirectUris: input.redirectUris,
    tokenEndpointAuthMethod: input.tokenEndpointAuthMethod,
    scope: input.scope ?? null,
    createdAt,
  };
}

export async function getClient(clientId: string) {
  const rows = await db
    .select()
    .from(mcpOauthClients)
    .where(eq(mcpOauthClients.clientId, clientId))
    .limit(1);
  return rows[0] ?? null;
}

export async function verifyClientCredentials(
  clientId: string,
  clientSecret: string | undefined,
): Promise<{ valid: boolean }> {
  const client = await getClient(clientId);
  if (!client) return { valid: false };
  if (client.tokenEndpointAuthMethod === 'none') return { valid: true };
  if (!clientSecret || !client.clientSecretHash) return { valid: false };
  return {
    valid: hashesEqual(hashToken(clientSecret), client.clientSecretHash),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Authorization codes
// ─────────────────────────────────────────────────────────────────────────

export async function issueAuthCode(input: {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
}): Promise<string> {
  const code = generateOpaqueToken(TOKEN_PREFIX.AUTH_CODE, 24);
  const createdAt = Date.now();
  await db.insert(mcpAuthCodes).values({
    code,
    clientId: input.clientId,
    userId: input.userId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    // Issuance is locked to S256: the authorize schema requires it and the
    // metadata advertises only S256, so "plain" can never reach here.
    codeChallengeMethod: 'S256',
    scope: input.scope,
    expiresAt: createdAt + TOKEN_TTL.AUTH_CODE_MS,
    createdAt,
  });
  return code;
}

export async function consumeAuthCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<
  { ok: true; userId: string; scope: string } | { ok: false; reason: string }
> {
  const now = Date.now();

  // The row is marked consumed only if every predicate matches at once, so a
  // malformed attempt (wrong client, expired) does NOT burn the code and the
  // legitimate client can retry. PKCE is checked after the consume: a
  // verifier mismatch means the code was probably intercepted, and there the
  // burn is exactly what we want.
  const consumed = await db
    .update(mcpAuthCodes)
    .set({ consumedAt: now })
    .where(
      and(
        eq(mcpAuthCodes.code, input.code),
        isNull(mcpAuthCodes.consumedAt),
        eq(mcpAuthCodes.clientId, input.clientId),
        eq(mcpAuthCodes.redirectUri, input.redirectUri),
        gte(mcpAuthCodes.expiresAt, now),
      ),
    )
    .returning();

  const row = consumed[0];
  if (!row) {
    return {
      ok: false,
      reason:
        'code not found, already consumed, expired, or client/redirect mismatch',
    };
  }
  if (!verifyPkceS256(input.codeVerifier, row.codeChallenge)) {
    return { ok: false, reason: 'PKCE verifier mismatch' };
  }
  return { ok: true, userId: row.userId, scope: row.scope };
}

// ─────────────────────────────────────────────────────────────────────────
// Access and refresh tokens
// ─────────────────────────────────────────────────────────────────────────

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: number;
}

export async function issueAccessToken(input: {
  clientId: string;
  userId: string;
  scope: string;
}): Promise<IssuedTokens> {
  const accessToken = generateOpaqueToken(TOKEN_PREFIX.ACCESS, 32);
  const refreshToken = generateOpaqueToken(TOKEN_PREFIX.REFRESH, 32);
  const createdAt = Date.now();
  await db.insert(mcpAccessTokens).values({
    tokenHash: hashToken(accessToken),
    refreshTokenHash: hashToken(refreshToken),
    clientId: input.clientId,
    userId: input.userId,
    scope: input.scope,
    expiresAt: createdAt + TOKEN_TTL.ACCESS_TOKEN_MS,
    refreshExpiresAt: createdAt + TOKEN_TTL.REFRESH_TOKEN_MS,
    createdAt,
  });
  return {
    accessToken,
    refreshToken,
    accessExpiresIn: Math.floor(TOKEN_TTL.ACCESS_TOKEN_MS / 1000),
  };
}

/**
 * Exchange a refresh token for a fresh access token.
 *
 * The refresh token itself is stable for its whole window and is swapped in
 * place rather than rotated. Strict single-use rotation locks the one
 * legitimate client out whenever a refresh is retried or a response is lost
 * in flight, and for a single-author repository that trade is not worth the
 * marginal forensic benefit.
 *
 * Every predicate lives in the WHERE clause, so a wrong client or an expired
 * token leaves the row untouched rather than needing a read-then-write.
 */
export async function refreshAccessToken(
  refreshTokenPlain: string,
  clientId: string,
): Promise<
  | { ok: true; tokens: IssuedTokens; userId: string; scope: string }
  | { ok: false; reason: string }
> {
  const now = Date.now();
  const accessToken = generateOpaqueToken(TOKEN_PREFIX.ACCESS, 32);

  const updated = await db
    .update(mcpAccessTokens)
    .set({
      tokenHash: hashToken(accessToken),
      expiresAt: now + TOKEN_TTL.ACCESS_TOKEN_MS,
      lastUsedAt: now,
    })
    .where(
      and(
        eq(mcpAccessTokens.refreshTokenHash, hashToken(refreshTokenPlain)),
        eq(mcpAccessTokens.clientId, clientId),
        isNull(mcpAccessTokens.revokedAt),
        gte(mcpAccessTokens.refreshExpiresAt, now),
      ),
    )
    .returning();

  const row = updated[0];
  if (!row) {
    return {
      ok: false,
      reason: 'refresh token not found, revoked, expired, or client mismatch',
    };
  }

  return {
    ok: true,
    tokens: {
      accessToken,
      refreshToken: refreshTokenPlain,
      accessExpiresIn: Math.floor(TOKEN_TTL.ACCESS_TOKEN_MS / 1000),
    },
    userId: row.userId,
    scope: row.scope,
  };
}

export async function lookupAccessToken(accessTokenPlain: string): Promise<{
  userId: string;
  clientId: string;
  scope: string;
  expiresAt: number;
} | null> {
  const hash = hashToken(accessTokenPlain);
  const rows = await db
    .select({
      userId: mcpAccessTokens.userId,
      clientId: mcpAccessTokens.clientId,
      scope: mcpAccessTokens.scope,
      expiresAt: mcpAccessTokens.expiresAt,
      revokedAt: mcpAccessTokens.revokedAt,
    })
    .from(mcpAccessTokens)
    .where(eq(mcpAccessTokens.tokenHash, hash))
    .limit(1);

  const row = rows[0];
  if (!row || row.revokedAt || row.expiresAt < Date.now()) return null;

  // Best-effort last-used touch; a failure here must not fail the tool call.
  void db
    .update(mcpAccessTokens)
    .set({ lastUsedAt: Date.now() })
    .where(eq(mcpAccessTokens.tokenHash, hash))
    .catch(() => {});

  return {
    userId: row.userId,
    clientId: row.clientId,
    scope: row.scope,
    expiresAt: row.expiresAt,
  };
}

/**
 * Drop expired auth codes and tokens whose refresh window has also closed.
 * Not scheduled — exposed for a future cron. Deliberately not keyed on
 * `expiresAt`: a row past its access-token TTL still carries a usable
 * refresh token, and deleting it would force re-authorisation every day.
 */
export async function purgeExpired(): Promise<void> {
  const now = Date.now();
  await db.delete(mcpAuthCodes).where(lt(mcpAuthCodes.expiresAt, now));
  await db
    .delete(mcpAccessTokens)
    .where(lt(mcpAccessTokens.refreshExpiresAt, now));
}
