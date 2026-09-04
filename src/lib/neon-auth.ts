import 'server-only';

/**
 * Server-side Neon Auth instance.
 *
 * Import only from server components, route handlers, server actions and
 * middleware. Consumed by:
 *   - src/middleware.ts                    (the OAuth verifier exchange)
 *   - src/app/api/auth/[...path]/route.ts  (the catch-all auth proxy)
 *   - src/lib/mcp/admin-session.ts         (who is approving a connector)
 *
 * Environment (Vercel's Neon Auth integration injects the endpoint; the
 * cookie secret is *not* injected and has to be set by hand):
 *   NEON_AUTH_BASE_URL         Neon Auth endpoint for this branch. Older
 *                              provisionings called it NEON_AUTH_URL —
 *                              both are accepted.
 *   NEON_AUTH_COOKIE_SECRET    32+ chars. `openssl rand -base64 48`.
 *   ALLOWED_EMAILS             Comma-separated sign-in allow-list. Enforced
 *                              in admin-session.ts, not here.
 *
 * `createNeonAuth` validates the cookie secret's length at *module load*, so
 * an unconfigured deployment would throw on import — including during
 * `next build`, which loads every route module. The placeholders below keep
 * the module import-safe; nothing signed with them can ever validate, and
 * `isNeonAuthConfigured()` is what the app actually branches on.
 */
import { createNeonAuth } from '@neondatabase/auth/next/server';

const PLACEHOLDER_BASE_URL = 'http://localhost:0';
const PLACEHOLDER_COOKIE_SECRET =
  'neon-auth-is-not-configured-on-this-deployment-placeholder';

function resolveBaseUrl(): string | null {
  const url = (
    process.env.NEON_AUTH_BASE_URL ??
    process.env.NEON_AUTH_URL ??
    ''
  ).trim();
  return url || null;
}

function resolveCookieSecret(): string | null {
  const secret = (process.env.NEON_AUTH_COOKIE_SECRET ?? '').trim();
  return secret.length >= 32 ? secret : null;
}

/** True when this deployment can actually complete a sign-in. */
export function isNeonAuthConfigured(): boolean {
  return Boolean(resolveBaseUrl() && resolveCookieSecret());
}

export const auth = createNeonAuth({
  baseUrl: resolveBaseUrl() ?? PLACEHOLDER_BASE_URL,
  cookies: { secret: resolveCookieSecret() ?? PLACEHOLDER_COOKIE_SECRET },
});
