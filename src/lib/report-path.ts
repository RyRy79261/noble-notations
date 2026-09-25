/**
 * Shared by the report sheet in the browser and `/api/report` on the
 * server, so it imports nothing and carries no `'use client'`.
 */

/**
 * The page's address, safe to put in a public issue.
 *
 * An upload link is a credential until it is spent: `/upload/<token>`. The
 * report is filed on a public repository, so the token is replaced before
 * the address leaves the browser, and the server replaces it again.
 */
export function reportablePath(pathname: string, search: string): string {
  const path = pathname.replace(
    /\/(upload|api\/uploads)\/[^/?#]+/g,
    '/$1/[token]',
  );
  return `${path}${search}`;
}
