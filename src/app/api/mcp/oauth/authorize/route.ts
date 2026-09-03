/**
 * /api/mcp/oauth/authorize — the interactive OAuth 2.1 authorize endpoint.
 *
 * GET  validates the request, ensures an administrator is signed in, and
 *      renders a consent screen.
 * POST re-validates from the form body and, on approval, mints an
 *      authorization code and sends the browser back to the client.
 *
 * The consent screen is plain server-rendered HTML rather than a React page:
 * it must work with no client JavaScript, inside Claude's in-app browser,
 * and it must not depend on any of the site's layout or data fetching.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getClient, issueAuthCode } from '@/lib/mcp/oauth';
import {
  parseScopeString,
  serialiseScopes,
  WRITE_SCOPE,
  type Scope,
} from '@/lib/mcp/scopes';
import {
  getAdminUser,
  getSignedInUser,
  isAdminConfigured,
} from '@/lib/mcp/admin-session';
import { SIGN_IN_PATH } from '@/lib/auth-routes';
import { getPublicOrigin } from '@/lib/mcp/origin';

export const dynamic = 'force-dynamic';

// PKCE is restricted to S256 to match `code_challenge_methods_supported` in
// the authorization-server metadata. Accepting "plain" would weaken PKCE and
// contradict what discovery advertises.
const querySchema = z.object({
  response_type: z.literal('code'),
  client_id: z.string().min(1),
  redirect_uri: z.url(),
  code_challenge: z.string().min(43).max(128),
  code_challenge_method: z.literal('S256').default('S256'),
  state: z.string().min(1).max(512),
  scope: z.string().max(500).optional(),
});

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c] as string,
  );
}

const PAGE_STYLE = `
  :root { color-scheme: dark; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
         background: #0d0a14; color: #e4e0ec; margin: 0; padding: 2rem 1.25rem;
         display: flex; justify-content: center; }
  .card { background: #16121f; border: 1px solid #2a2140; border-radius: 14px;
          padding: 1.75rem; max-width: 30rem; width: 100%; }
  h1 { font-size: 1.2rem; margin: 0 0 .35rem; }
  p { color: #a89fbb; line-height: 1.55; margin: .5rem 0; }
  ul { color: #cdc6dd; padding-left: 1.15rem; line-height: 1.6; }
  code { background: #221a33; padding: .1rem .35rem; border-radius: 5px;
         font-size: .85em; }
  .scope { display: inline-block; background: #241b38; color: #b794ff;
           border: 1px solid #3d2f5c; border-radius: 999px;
           padding: .15rem .6rem; font-size: .8rem; margin-right: .35rem; }
  .warn { background: #2a1420; border: 1px solid #5c2f42; color: #ffb4c8;
          border-radius: 10px; padding: .75rem .9rem; font-size: .9rem; }
  .actions { display: flex; gap: .6rem; margin-top: 1.5rem; }
  button { font: inherit; padding: .6rem 1.1rem; border-radius: 9px;
           border: 0; cursor: pointer; font-weight: 600; }
  .approve { background: #b794ff; color: #17102b; }
  .deny { background: #2a2140; color: #cdc6dd; }
  pre { background: #221a33; padding: .9rem; border-radius: 9px;
        overflow: auto; font-size: .85rem; }
`;

function page(title: string, inner: string, status = 200): NextResponse {
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title><style>${PAGE_STYLE}</style></head>
<body><div class="card">${inner}</div></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

function renderError(message: string, status = 400): NextResponse {
  return page(
    'Authorization error',
    `<h1>Authorization failed</h1><pre>${escapeHtml(message)}</pre>`,
    status,
  );
}

/**
 * Cross-origin redirect delivered as an HTML document rather than a 302.
 *
 * The app's CSP sets `form-action 'self'`, and CSP3 §6.1.18 applies
 * form-action to redirects that follow a form POST — not just the initial
 * submission. A 302 from this handler to claude.ai is therefore dropped by
 * the browser with no error, and the Approve click silently does nothing.
 * A document load is not a form submission, so meta-refresh plus a scripted
 * navigation both get through; the anchor covers engines that honour
 * neither.
 */
function htmlRedirect(target: string): NextResponse {
  const escaped = escapeHtml(target);
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="refresh" content="0;url=${escaped}">
<title>Redirecting…</title></head><body>
<p>Redirecting back to the application… <a href="${escaped}">Continue</a> if nothing happens.</p>
<script>window.location.replace(${JSON.stringify(target)});</script>
</body></html>`,
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

function redirectClientWithError(
  redirectUri: string,
  state: string | null,
  error: string,
  description?: string,
): NextResponse {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  if (description) url.searchParams.set('error_description', description);
  if (state) url.searchParams.set('state', state);
  return htmlRedirect(url.toString());
}

async function validate(req: NextRequest) {
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return {
      ok: false as const,
      response: renderError(
        `Invalid request: ${z.prettifyError(parsed.error)}`,
      ),
    };
  }

  const client = await getClient(parsed.data.client_id);
  if (!client) {
    return { ok: false as const, response: renderError('Unknown client_id') };
  }
  // The registered list is the authority — a redirect_uri that merely looks
  // plausible is exactly the attack DCR allow-listing exists to stop.
  if (!client.redirectUris.includes(parsed.data.redirect_uri)) {
    return {
      ok: false as const,
      response: renderError('redirect_uri not registered for this client'),
    };
  }

  const scopes = parseScopeString(parsed.data.scope);
  return {
    ok: true as const,
    params: parsed.data,
    client,
    scopes,
    scope: serialiseScopes(scopes),
  };
}

function scopeDescription(scopes: Scope[]): string {
  const canWrite = scopes.includes(WRITE_SCOPE);
  const items = [
    '<li>Read every recipe, revision, ingredient, note and experiment</li>',
    '<li>Search the repository and browse its taxonomy</li>',
  ];
  if (canWrite) {
    items.push(
      '<li><strong>Create recipes and append revisions</strong></li>',
      '<li><strong>Add notes, ingredients and experiment logs</strong></li>',
    );
  }
  const warning = canWrite
    ? `<p class="warn">This grants <strong>write access</strong>. The connector
       will be able to add and revise content on your site. Nothing is ever
       deleted or overwritten — revisions are appended — but new content will
       appear publicly.</p>`
    : '';
  return `<ul>${items.join('')}</ul>${warning}`;
}

export async function GET(req: NextRequest) {
  if (!isAdminConfigured()) {
    return renderError(
      'This deployment has no administrator identity configured. Set ' +
        'NEON_AUTH_BASE_URL, NEON_AUTH_COOKIE_SECRET and ALLOWED_EMAILS ' +
        'before connecting.',
      503,
    );
  }

  const validated = await validate(req);
  if (!validated.ok) return validated.response;
  const { client, scopes } = validated;

  const user = await getAdminUser();
  if (!user) {
    // Signed in as somebody who is not on the allow-list is a dead end —
    // bouncing them back to sign in would loop forever, so say so plainly.
    const signedIn = await getSignedInUser();
    if (signedIn) {
      return renderError(
        `Signed in as ${signedIn.email ?? signedIn.userId}, which is not ` +
          'permitted to approve connectors for this repository. Sign out ' +
          'and sign in with an address on ALLOWED_EMAILS.',
        403,
      );
    }

    // Bounce through the sign-in page, which forwards back here once a
    // session cookie exists.
    const origin = getPublicOrigin(req);
    const signIn = new URL(SIGN_IN_PATH, origin);
    signIn.searchParams.set(
      'callbackURL',
      `/api/mcp/oauth/authorize?${req.nextUrl.searchParams.toString()}`,
    );
    return NextResponse.redirect(signIn.toString(), { status: 302 });
  }

  const hidden = Array.from(req.nextUrl.searchParams.entries())
    .map(
      ([k, v]) =>
        `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`,
    )
    .join('');

  return page(
    'Connect to Noble Notations',
    `<h1>Connect to Noble Notations</h1>
     <p><strong>${escapeHtml(client.clientName)}</strong> is asking for access to
        your recipe repository.</p>
     ${scopeDescription(scopes)}
     <p>${scopes.map((s) => `<span class="scope">${escapeHtml(s)}</span>`).join('')}</p>
     <form method="POST" class="actions">
       ${hidden}
       <button type="submit" name="action" value="approve" class="approve">Approve</button>
       <button type="submit" name="action" value="deny" class="deny">Deny</button>
     </form>`,
  );
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const action = String(form.get('action') ?? '');

  // Rebuild the query params from the hidden inputs so the same validator
  // runs over both requests.
  const rebuilt = new URL(req.url);
  rebuilt.search = '';
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string' && key !== 'action') {
      rebuilt.searchParams.set(key, value);
    }
  }

  const validated = await validate(new NextRequest(rebuilt));
  if (!validated.ok) return validated.response;
  const { params, scope } = validated;

  const user = await getAdminUser();
  if (!user) {
    return redirectClientWithError(
      params.redirect_uri,
      params.state,
      'access_denied',
      'No authorised administrator session',
    );
  }

  if (action !== 'approve') {
    return redirectClientWithError(
      params.redirect_uri,
      params.state,
      'access_denied',
      'Consent declined',
    );
  }

  const code = await issueAuthCode({
    clientId: params.client_id,
    userId: user.userId,
    redirectUri: params.redirect_uri,
    codeChallenge: params.code_challenge,
    scope,
  });

  const callback = new URL(params.redirect_uri);
  callback.searchParams.set('code', code);
  callback.searchParams.set('state', params.state);
  return htmlRedirect(callback.toString());
}
