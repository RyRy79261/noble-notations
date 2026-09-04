/**
 * Neon Auth proxy — required for the hosted sign-in return trip.
 *
 * (Next.js 16 renamed the `middleware` file convention to `proxy`; this is
 * the same hook under its current name.)
 *
 * When a sign-in completes on Neon Auth's hosted pages, the browser comes
 * back to this origin with `?neon_auth_session_verifier=<token>` appended.
 * No session cookie exists yet: the verifier has to be exchanged
 * server-side for the real cookie. That exchange (`exchangeOAuthToken`)
 * runs **only** inside `auth.middleware()` — it is not part of
 * `auth.handler()` and cannot be triggered from a route handler. Without
 * this file the user lands back with the verifier in the URL, no cookie
 * ever materialises, and the OAuth consent screen bounces them to sign in
 * again forever.
 *
 * Scope is deliberately tiny. Nothing on this site is behind a login: the
 * recipes are public and the MCP endpoints authenticate with bearer tokens.
 * The auth exchange runs on the two auth paths and nowhere else — a wider
 * matcher would start redirecting anonymous readers, and `/api/mcp/*` must
 * stay reachable without a browser session.
 *
 * One more path is matched, and it never reaches the auth code: a recipe
 * URL. `/recipes/<slug>.md` is the address an agent guesses for the plain
 * text of a page, and a route handler cannot claim a segment that a page
 * already owns, so the suffix is rewritten here to the handler's own path.
 * Every other recipe URL passes straight through.
 *
 * `loginUrl` stays pointed at the sign-in page, which makes
 * `processAuthMiddleware` early-return `allow` for anything at or under
 * `/auth` — before its verifier-exchange step. That is precisely why the
 * return trip lands on `/oauth-return` instead; see src/lib/auth-routes.ts.
 *
 * The matcher below must repeat those paths as string literals: Next.js
 * statically analyses `config.matcher` at build time and silently ignores
 * anything it cannot evaluate, imported constants included.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/neon-auth';
import { SIGN_IN_PATH } from '@/lib/auth-routes';

const neonAuthMiddleware = auth.middleware({ loginUrl: SIGN_IN_PATH });

const MARKDOWN_SUFFIX = '.md';

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/recipes/')) {
    if (!pathname.endsWith(MARKDOWN_SUFFIX)) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = `${pathname.slice(0, -MARKDOWN_SUFFIX.length)}/md`;
    return NextResponse.rewrite(url);
  }

  return neonAuthMiddleware(request);
}

export const config = {
  // Keep in sync with SIGN_IN_PATH and OAUTH_RETURN_PATH. Written out as
  // string literals: Next.js statically analyses this array at build time.
  matcher: ['/auth', '/oauth-return', '/recipes/:slug'],
};
