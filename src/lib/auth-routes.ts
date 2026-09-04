/**
 * Auth paths shared by client and server code.
 *
 * `OAUTH_RETURN_PATH` deliberately lives *outside* `/auth`. Neon Auth's
 * middleware returns `allow` for any path at or under `loginUrl` **before**
 * it reaches the verifier exchange (`processAuthMiddleware` in
 * @neondatabase/auth checks `isSamePathOrSubpath` first), so a hosted
 * sign-in that returned the browser to
 * `/auth?neon_auth_session_verifier=…` would be served as an ordinary page
 * and no session cookie would ever be minted. Sending the return trip to a
 * sibling path keeps the exchange reachable.
 */
export const SIGN_IN_PATH = '/auth';
export const OAUTH_RETURN_PATH = '/oauth-return';

/**
 * Only same-origin relative paths are accepted as a post-sign-in
 * destination. An open redirect here would be handed straight to an OAuth
 * flow, so anything absolute or protocol-relative falls back to the site
 * root rather than being sanitised into something "close enough".
 */
export function safeCallbackUrl(raw: string | null | undefined): string {
  if (!raw) return '/';
  if (!raw.startsWith('/')) return '/';
  if (raw.startsWith('//')) return '/';
  return raw;
}

/** The hosted-sign-in return trip, carrying its eventual destination. */
export function oauthReturnUrl(callbackUrl: string): string {
  const target = safeCallbackUrl(callbackUrl);
  return `${OAUTH_RETURN_PATH}?next=${encodeURIComponent(target)}`;
}
