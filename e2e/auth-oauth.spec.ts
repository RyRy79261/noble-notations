import { createHash, randomBytes } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { Client } from 'pg';

/**
 * The OAuth surface claude.ai touches before it ever reaches a tool.
 *
 * The suite mints bearer tokens in `global-setup` and drives the MCP
 * endpoint with them, which is the right trade — the interactive half needs
 * a browser, a Neon Auth session and a human clicking Approve — but it means
 * every document and every endpoint the connector dialog reads on its way in
 * was untested. Discovery, dynamic client registration, the token endpoint
 * and the CORS preflight are the whole of what a client sees before it holds
 * a token, and a fault in any of them ends the connection with no useful
 * error.
 *
 * `docs/mcp-connector.md` § Verification names three curl checks. Only one of
 * them — the `WWW-Authenticate` on a 401 — had a test. These are the other
 * two, plus the properties the same document argues for at length:
 * `VERCEL_URL` is the wrong issuer, `DELETE` must be in the preflight
 * allow-list, and the 401 hint must be readable across origins.
 *
 * The consent screen and the code exchange are in `auth-consent.spec.ts`:
 * they need a second server with an administrator identity, and these do
 * not.
 */

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3100}`;

const CLAUDE_REDIRECT = 'https://claude.ai/api/mcp/auth_callback';

interface Metadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  scopes_supported: string[];
  code_challenge_methods_supported: string[];
}

async function register(body: unknown): Promise<{
  status: number;
  json: Record<string, unknown>;
}> {
  const response = await fetch(`${BASE}/api/mcp/oauth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    json: (await response.json()) as Record<string, unknown>,
  };
}

async function token(form: Record<string, string>): Promise<{
  status: number;
  json: Record<string, unknown>;
  cacheControl: string | null;
}> {
  const response = await fetch(`${BASE}/api/mcp/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
  });
  return {
    status: response.status,
    json: (await response.json()) as Record<string, unknown>,
    cacheControl: response.headers.get('cache-control'),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Discovery — the documents a client reads first
// ─────────────────────────────────────────────────────────────────────────

test('the authorization server advertises itself at the host the request arrived on', async () => {
  // THE VERCEL_URL FAULT, and it is the one that ends a connection with no
  // error a person can read. `VERCEL_URL` is the deployment-hash domain and
  // on a production deployment that domain sits behind Vercel SSO: advertise
  // it here and claude.ai follows it into a 403. `getPublicOrigin()` prefers
  // the host the user actually reached, so a proxied request must be
  // answered with the proxied host — not with the socket this server is
  // listening on, and not with anything read from the environment.
  const proxied = await fetch(
    `${BASE}/.well-known/oauth-authorization-server`,
    {
      headers: {
        'x-forwarded-host': 'noble-notations.ryanjnoble.dev',
        'x-forwarded-proto': 'https',
      },
    },
  );
  expect(proxied.status).toBe(200);
  const metadata = (await proxied.json()) as Metadata;

  expect(metadata.issuer).toBe('https://noble-notations.ryanjnoble.dev');
  // Every endpoint in the document is built from that same origin. One of
  // them pointing somewhere else sends the browser to a host that will not
  // recognise the code it is carrying.
  for (const endpoint of [
    metadata.authorization_endpoint,
    metadata.token_endpoint,
    metadata.registration_endpoint,
  ]) {
    expect(endpoint.startsWith('https://noble-notations.ryanjnoble.dev/')).toBe(
      true,
    );
  }
  expect(metadata.authorization_endpoint).toContain('/api/mcp/oauth/authorize');

  // And with no proxy header the same document names this server, so a
  // loopback client and a deployed one both get an issuer that answers.
  const direct = (await (
    await fetch(`${BASE}/.well-known/oauth-authorization-server`)
  ).json()) as Metadata;
  expect(direct.issuer).toBe(BASE);
});

test('discovery offers S256 and nothing else, which is what authorize enforces', async () => {
  // `code_challenge_method` is a `z.literal('S256')` on the authorize route.
  // Advertising "plain" here would make a client send a challenge this
  // server then refuses, and the refusal arrives as a rendered error page in
  // the middle of a consent flow.
  const metadata = (await (
    await fetch(`${BASE}/.well-known/oauth-authorization-server`)
  ).json()) as Metadata;
  expect(metadata.code_challenge_methods_supported).toEqual(['S256']);
  expect(metadata.scopes_supported).toEqual([
    'noble-notations:read',
    'noble-notations:write',
  ]);
});

test('the protected-resource document points at this server as its own authority', async () => {
  const response = await fetch(`${BASE}/.well-known/oauth-protected-resource`);
  expect(response.status).toBe(200);
  const doc = (await response.json()) as {
    resource: string;
    authorization_servers: string[];
    bearer_methods_supported: string[];
  };

  // The resource is the MCP base path, not the doubled endpoint: RFC 9728
  // names the protected resource, and `/api/mcp/mcp` is one transport under
  // it.
  expect(doc.resource).toBe(`${BASE}/api/mcp`);
  expect(doc.authorization_servers).toEqual([BASE]);
  expect(doc.bearer_methods_supported).toEqual(['header']);
});

test('the 401 hint is followable: it names a document that exists and answers', async () => {
  // A browser client discovers where to authorise by reading
  // `WWW-Authenticate` off the 401. Asserting the header is present proves
  // nothing about whether the address inside it resolves, and a hint that
  // 404s dead-ends the connector exactly as an absent hint does.
  const refused = await fetch(`${BASE}/api/mcp/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  expect(refused.status).toBe(401);

  const header = refused.headers.get('www-authenticate') ?? '';
  const hinted = /resource_metadata="([^"]+)"/.exec(header)?.[1];
  expect(hinted, `no resource_metadata in: ${header}`).toBeTruthy();

  const followed = await fetch(hinted!);
  expect(followed.status).toBe(200);
  const doc = (await followed.json()) as { authorization_servers: string[] };
  expect(doc.authorization_servers[0]).toBe(BASE);
});

test('a token that is not a token is refused, not answered and not a 500', async () => {
  const response = await fetch(`${BASE}/api/mcp/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: 'Bearer mcp_at_this-token-was-never-issued-by-anything',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  expect(response.status).toBe(401);
  expect(response.headers.get('www-authenticate')).toContain('Bearer');
});

// ─────────────────────────────────────────────────────────────────────────
// 2. CORS — claude.ai calls every one of these from another origin
// ─────────────────────────────────────────────────────────────────────────

test('the preflight allows session termination and exposes the authorization hint', async () => {
  // Two hard-won details from docs/mcp-connector.md, neither of them
  // previously asserted. DELETE is MCP Streamable HTTP session termination:
  // omit it from the allow-list and the browser blocks the request before it
  // arrives. And `WWW-Authenticate` has to be CORS-EXPOSED, not merely sent
  // — an unexposed header cannot be read cross-origin, so the client never
  // learns where to authorise and the connector dead-ends with no error.
  const response = await fetch(`${BASE}/api/mcp/mcp`, {
    method: 'OPTIONS',
    headers: {
      origin: 'https://claude.ai',
      'access-control-request-method': 'DELETE',
    },
  });
  expect(response.status).toBe(204);

  const methods = response.headers.get('access-control-allow-methods') ?? '';
  expect(methods).toContain('DELETE');
  expect(methods).toContain('POST');

  const exposed = response.headers.get('access-control-expose-headers') ?? '';
  expect(exposed.toLowerCase()).toContain('www-authenticate');

  const allowedHeaders =
    response.headers.get('access-control-allow-headers')?.toLowerCase() ?? '';
  // The session id travels in a header of its own, so a preflight that omits
  // it blocks every call after `initialize`.
  expect(allowedHeaders).toContain('mcp-session-id');
  expect(allowedHeaders).toContain('authorization');
});

test('the discovery documents answer a cross-origin preflight too', async () => {
  // Discovery happens from the browser as well, and a `.well-known` document
  // that cannot be preflighted is a connector that never gets past its first
  // request.
  for (const path of [
    '/.well-known/oauth-authorization-server',
    '/.well-known/oauth-protected-resource',
    '/api/mcp/oauth/register',
  ]) {
    const response = await fetch(`${BASE}${path}`, {
      method: 'OPTIONS',
      headers: { origin: 'https://claude.ai' },
    });
    expect(response.status, `${path} preflight`).toBe(204);
    expect(
      response.headers.get('access-control-allow-origin'),
      `${path} preflight`,
    ).toBe('*');
  }
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Dynamic client registration — the one unauthenticated write
// ─────────────────────────────────────────────────────────────────────────

test('registration refuses a redirect_uri this project did not allow', async () => {
  // DCR is unauthenticated by necessity: claude.ai registers itself before
  // anybody has approved anything. The allow-list is therefore the whole of
  // the control. A registered foreign redirect_uri would be an authorization
  // code delivered to somebody else's server, and the consent screen would
  // have said the right words while doing it.
  const evil = await register({
    client_name: 'x',
    redirect_uris: ['https://evil.example.com/cb'],
  });
  expect(evil.status).toBe(400);
  expect(evil.json.error).toBe('invalid_redirect_uri');

  // Not https, and not loopback: a code delivered in clear text.
  const insecure = await register({
    client_name: 'x',
    redirect_uris: ['http://claude.ai/cb'],
  });
  expect(insecure.status).toBe(400);
  expect(insecure.json.error).toBe('invalid_redirect_uri');

  // A host that merely ends in the right letters. `claude.ai.evil.example`
  // is the classic suffix mistake and it is not a subdomain of anything.
  const lookalike = await register({
    client_name: 'x',
    redirect_uris: ['https://claude.ai.evil.example/cb'],
  });
  expect(lookalike.status).toBe(400);
  expect(lookalike.json.error).toBe('invalid_redirect_uri');

  // One bad entry poisons the whole registration rather than being dropped
  // quietly, because a client that registered two URIs and got one has no
  // way to know which.
  const mixed = await register({
    client_name: 'x',
    redirect_uris: [CLAUDE_REDIRECT, 'https://evil.example.com/cb'],
  });
  expect(mixed.status).toBe(400);
  expect(mixed.json.error).toBe('invalid_redirect_uri');
});

test('registration accepts a claude.ai callback and mints a public client', async () => {
  const ok = await register({
    client_name: 'Claude',
    redirect_uris: [CLAUDE_REDIRECT],
  });
  expect(ok.status).toBe(201);
  expect(String(ok.json.client_id)).toMatch(/^mcp_client_/);
  expect(ok.json.redirect_uris).toEqual([CLAUDE_REDIRECT]);
  expect(ok.json.grant_types).toEqual(['authorization_code', 'refresh_token']);
  // `none` is the default and the only method claude.ai uses, and a public
  // client must not be handed a secret it would then have to store.
  expect(ok.json.token_endpoint_auth_method).toBe('none');
  expect(ok.json.client_secret).toBeUndefined();

  // A loopback callback is allowed on either scheme, because that is a
  // developer running a client on this machine and there is no wire to
  // intercept.
  const local = await register({
    client_name: 'a local client',
    redirect_uris: ['http://127.0.0.1:41234/callback'],
  });
  expect(local.status).toBe(201);
});

test('a malformed registration is a 400 that says so, not a 500', async () => {
  const notAUrl = await register({
    client_name: 'x',
    redirect_uris: ['not a url at all'],
  });
  expect(notAUrl.status).toBe(400);
  expect(notAUrl.json.error).toBe('invalid_client_metadata');

  const empty = await register({ client_name: 'x', redirect_uris: [] });
  expect(empty.status).toBe(400);
  expect(empty.json.error).toBe('invalid_client_metadata');

  const notJson = await fetch(`${BASE}/api/mcp/oauth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: 'this is not JSON',
  });
  expect(notJson.status).toBe(400);
  expect(((await notJson.json()) as { error: string }).error).toBe(
    'invalid_client_metadata',
  );
});

// ─────────────────────────────────────────────────────────────────────────
// 4. The token endpoint
// ─────────────────────────────────────────────────────────────────────────

test('only the two grants this server implements are accepted', async () => {
  // `password` is the grant an implementation reaches for when it wants to
  // skip the browser. Accepting it would turn ALLOWED_EMAILS and the consent
  // screen into decoration.
  const password = await token({
    grant_type: 'password',
    username: 'owner',
    password: 'hunter2',
  });
  expect(password.status).toBe(400);
  expect(password.json.error).toBe('unsupported_grant_type');

  const implicit = await token({ grant_type: 'implicit' });
  expect(implicit.json.error).toBe('unsupported_grant_type');
});

test('a code that was never issued buys nothing, and the answer is not cached', async () => {
  const registered = await register({
    client_name: 'Claude',
    redirect_uris: [CLAUDE_REDIRECT],
  });

  const refused = await token({
    grant_type: 'authorization_code',
    code: 'mcp_ac_this-code-was-never-issued-by-this-server',
    redirect_uri: CLAUDE_REDIRECT,
    client_id: String(registered.json.client_id),
    code_verifier: 'v'.repeat(64),
  });
  expect(refused.status).toBe(400);
  expect(refused.json.error).toBe('invalid_grant');
  // RFC 6749 §5.1: no intermediary may hold a token response, and the rule
  // is applied to the errors as well so a failed attempt cannot be replayed
  // out of a cache either.
  expect(refused.cacheControl).toContain('no-store');

  const unknownClient = await token({
    grant_type: 'authorization_code',
    code: 'mcp_ac_anything',
    redirect_uri: CLAUDE_REDIRECT,
    client_id: 'mcp_client_never-registered',
    code_verifier: 'v'.repeat(64),
  });
  expect(unknownClient.status).toBe(401);
  expect(unknownClient.json.error).toBe('invalid_client');
});

test('a refresh token that was never issued is refused', async () => {
  const registered = await register({
    client_name: 'Claude',
    redirect_uris: [CLAUDE_REDIRECT],
  });
  const refused = await token({
    grant_type: 'refresh_token',
    refresh_token: 'mcp_rt_this-was-never-issued',
    client_id: String(registered.json.client_id),
  });
  expect(refused.status).toBe(400);
  expect(refused.json.error).toBe('invalid_grant');
  expect(refused.cacheControl).toContain('no-store');
});

// ─────────────────────────────────────────────────────────────────────────
// 5. The authorize endpoint fails closed
// ─────────────────────────────────────────────────────────────────────────

test('with no administrator identity configured, nothing can be approved', async () => {
  // The suite's server has no Neon Auth and no ALLOWED_EMAILS, which is the
  // state of any fork, any preview and any local checkout. The endpoint that
  // mints authorization codes must refuse in that state rather than fall
  // through to a screen nobody is behind: `getAdminUser()` returning null
  // for want of a provider looks exactly like "not signed in", and bouncing
  // to a sign-in page that cannot complete is an infinite loop.
  //
  // It also has to say which variables are missing. This is the first thing
  // an owner meets when the connector does not work, and the answer is
  // always one of three names.
  const response = await fetch(
    `${BASE}/api/mcp/oauth/authorize?response_type=code` +
      `&client_id=mcp_client_anything` +
      `&redirect_uri=${encodeURIComponent(CLAUDE_REDIRECT)}` +
      `&code_challenge=${'a'.repeat(43)}&code_challenge_method=S256` +
      `&state=abc`,
    { redirect: 'manual' },
  );
  expect(response.status).toBe(503);

  const html = await response.text();
  expect(html).toContain('NEON_AUTH_BASE_URL');
  expect(html).toContain('NEON_AUTH_COOKIE_SECRET');
  expect(html).toContain('ALLOWED_EMAILS');
  // A refusal, not a redirect to a client and not a code.
  expect(html).not.toContain('code=');
  expect(response.headers.get('location')).toBeNull();
});

// ─────────────────────────────────────────────────────────────────────────
// 6. Time — the one property every token is minted around and never through
// ─────────────────────────────────────────────────────────────────────────

/*
 * Both of these survived a mutation run with the whole suite green: the
 * expiry test was deleted from `lookupAccessToken` and from
 * `consumeAuthCode`, and 381 tests still passed. Thirteen of the fourteen
 * other OAuth mutations died loudly, so this is not a thin area — it is one
 * property, and the reason it was missed is structural. `global-setup` and
 * the consent spec both MINT their credentials, and a freshly minted
 * credential is valid by construction. No test has ever held a stale one.
 *
 * THE ACCESS TOKEN IS GUARDED TWICE, which is worth writing down because it
 * changes what the first test below proves. `lookupAccessToken` refuses a
 * stale row, and `verifyToken` in the route also hands `expiresAt` to the
 * SDK's bearer middleware, which refuses it again. Deleting either one on
 * its own therefore leaves the endpoint answering 401 — measured, not
 * assumed — so the mutation survived by redundancy and not by absence. What
 * had no test was the PROPERTY, and it is the property that matters to a
 * connector: a token past its lifetime buys nothing and the refusal carries
 * the hint that says where to get a new one. That is what is asserted here,
 * at the boundary, where both layers are in the answer.
 *
 * So these two plant a row and back-date it. Writing to the OAuth tables
 * directly is the same thing `auth-consent.spec.ts` does, and it is the only
 * way to hold a credential older than its own lifetime without waiting a day
 * for the access token and ten minutes for the code.
 *
 * EACH ONE CARRIES ITS OWN CONTROL — a second row, identical but for the one
 * timestamp — because "refused" on its own proves nothing. A missing client,
 * a wrong hash or a typo in a column name refuses too, and refuses for a
 * reason that has nothing to do with time.
 */

const EXPIRED_USER = 'e2e-expired-credentials';

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Call `tools/list` with a bearer token and report the status and hint. */
async function toolsList(bearer: string): Promise<{
  status: number;
  wwwAuthenticate: string | null;
  body: string;
}> {
  const response = await fetch(`${BASE}/api/mcp/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  return {
    status: response.status,
    wwwAuthenticate: response.headers.get('www-authenticate'),
    body: await response.text(),
  };
}

test('an access token past its lifetime is refused, and a live one is not', async () => {
  const registered = await register({
    client_name: 'Claude',
    redirect_uris: [CLAUDE_REDIRECT],
  });
  const clientId = String(registered.json.client_id);

  const stale = `mcp_at_${randomBytes(32).toString('base64url')}`;
  const live = `mcp_at_${randomBytes(32).toString('base64url')}`;
  const now = Date.now();

  await withDb(async (client) => {
    // Only the SHA-256 hash is ever stored; the plaintext lives in the
    // Authorization header and nowhere else. `src/lib/mcp/tokens.ts`.
    for (const [plain, expiresAt] of [
      [stale, now - 60_000],
      [live, now + 60 * 60_000],
    ] as const) {
      await client.query(
        `INSERT INTO mcp_access_tokens
           (token_hash, client_id, user_id, scope, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          createHash('sha256').update(plain).digest('hex'),
          clientId,
          EXPIRED_USER,
          'noble-notations:read',
          expiresAt,
          now - 120_000,
        ],
      );
    }
  });

  const refused = await toolsList(stale);
  expect(refused.status).toBe(401);
  // The hint is how a browser client discovers where to authorize. A 401
  // without it dead-ends the connector, so the refusal and the hint are one
  // requirement and not two.
  expect(refused.wwwAuthenticate).toContain('Bearer');
  expect(refused.wwwAuthenticate).toContain('resource_metadata=');
  // The stale token is not a tool result under another name.
  expect(refused.body).not.toContain('search_recipes');

  // THE CONTROL. Same client, same user, same scope, same insert — one
  // number apart. Without it, a refusal proves only that the row was wrong.
  const accepted = await toolsList(live);
  expect(accepted.status).toBe(200);
  expect(accepted.body).toContain('search_recipes');
});

test('an authorization code past its lifetime cannot be spent, and a live one can', async () => {
  const registered = await register({
    client_name: 'Claude',
    redirect_uris: [CLAUDE_REDIRECT],
  });
  const clientId = String(registered.json.client_id);

  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const stale = `mcp_ac_${randomBytes(32).toString('base64url')}`;
  const live = `mcp_ac_${randomBytes(32).toString('base64url')}`;
  const now = Date.now();

  await withDb(async (client) => {
    // The code itself is the primary key and is stored in the clear, which
    // is what `consumeAuthCode` matches on. TOKEN_TTL.AUTH_CODE_MS is ten
    // minutes; the stale row is a minute past whatever that is.
    for (const [code, expiresAt] of [
      [stale, now - 60_000],
      [live, now + 5 * 60_000],
    ] as const) {
      await client.query(
        `INSERT INTO mcp_auth_codes
           (code, client_id, user_id, redirect_uri, code_challenge,
            code_challenge_method, scope, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5, 'S256', $6, $7, $8)`,
        [
          code,
          clientId,
          EXPIRED_USER,
          CLAUDE_REDIRECT,
          challenge,
          'noble-notations:read',
          expiresAt,
          now - 120_000,
        ],
      );
    }
  });

  const refused = await token({
    grant_type: 'authorization_code',
    code: stale,
    redirect_uri: CLAUDE_REDIRECT,
    client_id: clientId,
    code_verifier: verifier,
  });
  expect(refused.status).toBe(400);
  expect(refused.json.error).toBe('invalid_grant');
  expect(refused.json.access_token).toBeUndefined();

  // And the row was not burned by the attempt: an expired code is one of
  // the malformed cases `consumeAuthCode` deliberately does not consume, so
  // a client that retries meets the same answer rather than a second one.
  const stillUnconsumed = await withDb(async (client) =>
    client.query<{ consumed_at: string | null }>(
      'SELECT consumed_at FROM mcp_auth_codes WHERE code = $1',
      [stale],
    ),
  );
  expect(stillUnconsumed.rows[0]?.consumed_at).toBeNull();

  // THE CONTROL, and it is the whole reason the refusal above means
  // anything: every other field is identical.
  const accepted = await token({
    grant_type: 'authorization_code',
    code: live,
    redirect_uri: CLAUDE_REDIRECT,
    client_id: clientId,
    code_verifier: verifier,
  });
  expect(accepted.status).toBe(200);
  expect(typeof accepted.json.access_token).toBe('string');
});
