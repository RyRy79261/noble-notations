import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { mcpClient } from './helpers';

/**
 * The consent screen, and the half of OAuth the suite has always skipped.
 *
 * `global-setup` mints bearer tokens by calling `registerClient` and
 * `issueAccessToken` as functions, which is the right trade for a test run —
 * but it means the authorize route had no test at all. That route is the only
 * place a human decides anything in this whole system: it is what the
 * argument for `report_issue` rests on ("every caller holds a token the owner
 * approved on a consent screen"), it is where `ALLOWED_EMAILS` is enforced,
 * and it is ~14KB of hand-written HTML that nothing looked at.
 *
 * WHY THIS NEEDS A SECOND SERVER, AND A FORGED SESSION.
 *
 * The route refuses outright unless an administrator identity is configured,
 * and identity comes from Neon Auth, which is not reachable from a test
 * machine. So this file starts a second production server — from the build
 * already on disk — with `NEON_AUTH_*` and `ALLOWED_EMAILS` set to values
 * only this file knows, and then mints the session cookie itself.
 *
 * That is not a mock of the code under test. `@neondatabase/auth` caches a
 * session in `__Secure-neon-auth.local.session_data`, an HS256 JWT signed
 * with `NEON_AUTH_COOKIE_SECRET`, and `getSession()` validates that cookie
 * LOCALLY before it ever calls upstream — so a cookie signed with the secret
 * this server was given is the same cookie a real sign-in round trip leaves
 * behind. Everything downstream of the identity answer is the real path:
 * `ALLOWED_EMAILS`, the request validation, the rendered screen, the code,
 * PKCE, the token endpoint and the per-call scope check.
 *
 * The coupling is deliberate and it fails loudly. If that library changes
 * its cookie name or its format, these tests stop seeing an administrator
 * and get a redirect to the sign-in page instead of a consent screen — which
 * is exactly what a real owner would then get, so the failure is true.
 */

/**
 * Deliberately NOT serial, for the reason `e2e/mcp-report-issue.spec.ts`
 * gives: a failure in one test must not skip the rest, because each covers a
 * different way this screen can hand over access it should not. The tests
 * share a server and nothing else — each registers its own client — so
 * ordering buys nothing and hiding failures costs a great deal.
 */

/** Its own port. Nothing else in the suite listens here. */
const PORT = Number(
  process.env.E2E_CONSENT_PORT ?? Number(process.env.E2E_PORT ?? 3100) + 3,
);
const BASE = `http://127.0.0.1:${PORT}`;

const COOKIE_SECRET =
  'e2e-consent-screen-cookie-secret-for-the-second-server-0123456789';
const OWNER = 'owner@noble-notations.test';
const STRANGER = 'somebody-else@noble-notations.test';
const CLAUDE_REDIRECT = 'https://claude.ai/api/mcp/auth_callback';

let server: ChildProcess | null = null;
let output = '';

// ─────────────────────────────────────────────────────────────────────────
// The forged administrator session
// ─────────────────────────────────────────────────────────────────────────

const base64url = (value: object): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

/**
 * The cookie pair a completed Neon Auth sign-in leaves in the browser.
 *
 * Both are required and they do different jobs: the session token is what
 * the server looks for to decide a session exists at all, and the session
 * data cookie carries the signed answer. Supplying only one is how a real
 * half-finished sign-in looks, and it is treated as no session.
 */
function sessionCookie(email: string, userId = 'e2e-admin'): string {
  const now = Date.now();
  const expiresAtSeconds = Math.floor((now + 60 * 60_000) / 1000);
  const iso = (ms: number) => new Date(ms).toISOString();
  const payload = {
    session: {
      id: 'e2e-session',
      token: 'e2e-session-token',
      userId,
      expiresAt: iso(expiresAtSeconds * 1000),
      createdAt: iso(now),
      updatedAt: iso(now),
    },
    user: {
      id: userId,
      email,
      name: 'End to end',
      emailVerified: true,
      createdAt: iso(now),
      updatedAt: iso(now),
    },
    iat: Math.floor(now / 1000),
    exp: expiresAtSeconds,
    sub: userId,
  };
  const header = base64url({ alg: 'HS256', typ: 'JWT' });
  const body = base64url(payload);
  const signature = createHmac('sha256', COOKIE_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return (
    '__Secure-neon-auth.session_token=e2e-session-token; ' +
    `__Secure-neon-auth.local.session_data=${header}.${body}.${signature}`
  );
}

// ─────────────────────────────────────────────────────────────────────────
// The second server
// ─────────────────────────────────────────────────────────────────────────

test.beforeAll(async () => {
  test.setTimeout(180_000);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NEON_AUTH_BASE_URL: 'http://127.0.0.1:9/neon-auth-is-never-reached',
    NEON_AUTH_COOKIE_SECRET: COOKIE_SECRET,
    ALLOWED_EMAILS: `${OWNER}, SOMEBODY-ELSE-ENTIRELY@example.test`,
  };
  // NOTHING HERE MAY REACH api.github.com. Without a token `report_issue` is
  // not registered at all, and with the stub's base URL gone a stray call
  // would resolve to the real API — so both are removed rather than one.
  delete env.GITHUB_ISSUE_TOKEN;
  delete env.GITHUB_API_BASE_URL;

  server = spawn(
    process.execPath,
    [
      path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next'),
      'start',
      '-p',
      String(PORT),
    ],
    { cwd: process.cwd(), env, stdio: 'pipe', detached: true },
  );
  server.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
  server.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));

  const deadline = Date.now() + 120_000;
  let listening = false;
  while (!listening && Date.now() < deadline) {
    try {
      await fetch(`${BASE}/api/mcp/mcp`, { method: 'GET' });
      listening = true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  expect(
    listening,
    `the consent-screen server never answered on ${BASE}:\n${output}`,
  ).toBe(true);
});

test.afterAll(() => {
  // By PID and by process group, so the child cannot be orphaned. Never
  // `pkill` — that takes a sibling agent's server down with it.
  if (!server?.pid) return;
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    try {
      process.kill(server.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Driving the flow
// ─────────────────────────────────────────────────────────────────────────

async function registerClaudeClient(name = 'Claude'): Promise<string> {
  const response = await fetch(`${BASE}/api/mcp/oauth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: name,
      redirect_uris: [CLAUDE_REDIRECT],
    }),
  });
  expect(response.status).toBe(201);
  return String(((await response.json()) as { client_id: string }).client_id);
}

interface Pkce {
  verifier: string;
  challenge: string;
}

function pkce(): Pkce {
  const verifier = randomBytes(32).toString('base64url');
  return {
    verifier,
    challenge: createHash('sha256').update(verifier).digest('base64url'),
  };
}

function authorizeParams(args: {
  clientId: string;
  challenge: string;
  scope?: string;
  state?: string;
  redirectUri?: string;
}): URLSearchParams {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: args.clientId,
    redirect_uri: args.redirectUri ?? CLAUDE_REDIRECT,
    code_challenge: args.challenge,
    code_challenge_method: 'S256',
    state: args.state ?? 'the-state-the-client-chose',
  });
  if (args.scope) params.set('scope', args.scope);
  return params;
}

async function openConsent(
  params: URLSearchParams,
  cookie?: string,
): Promise<{ status: number; html: string; location: string | null }> {
  const response = await fetch(`${BASE}/api/mcp/oauth/authorize?${params}`, {
    redirect: 'manual',
    headers: cookie ? { cookie } : {},
  });
  return {
    status: response.status,
    html: await response.text(),
    location: response.headers.get('location'),
  };
}

async function submitConsent(
  params: URLSearchParams,
  action: 'approve' | 'deny',
  cookie?: string,
): Promise<{ status: number; html: string; location: string | null }> {
  const form = new URLSearchParams(params);
  form.set('action', action);
  const response = await fetch(`${BASE}/api/mcp/oauth/authorize`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...(cookie ? { cookie } : {}),
    },
    body: form,
  });
  return {
    status: response.status,
    html: await response.text(),
    location: response.headers.get('location'),
  };
}

/** The address the returned document actually sends the browser to. */
function redirectTargetOf(html: string): URL {
  const found = /<meta http-equiv="refresh" content="0;url=([^"]+)"/.exec(html);
  expect(found, `no meta-refresh in:\n${html}`).toBeTruthy();
  return new URL(found![1]!.replace(/&amp;/g, '&'));
}

async function exchange(form: Record<string, string>): Promise<{
  status: number;
  json: Record<string, unknown>;
}> {
  const response = await fetch(`${BASE}/api/mcp/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
  });
  return {
    status: response.status,
    json: (await response.json()) as Record<string, unknown>,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Who is allowed to see the screen at all
// ─────────────────────────────────────────────────────────────────────────

test('with no session the browser is sent to sign in and brought back here', async () => {
  const clientId = await registerClaudeClient();
  const params = authorizeParams({ clientId, challenge: pkce().challenge });

  const result = await openConsent(params);
  expect(result.status).toBe(302);

  const location = new URL(result.location ?? '');
  expect(location.pathname).toBe('/sign-in');

  // The whole authorize request has to survive the round trip. A callback
  // that loses the code_challenge or the state comes back as a request this
  // route then refuses, in the middle of a flow the person already started.
  const callback = new URL(
    location.searchParams.get('callbackURL') ?? '',
    BASE,
  );
  expect(callback.pathname).toBe('/api/mcp/oauth/authorize');
  for (const key of [
    'client_id',
    'redirect_uri',
    'code_challenge',
    'code_challenge_method',
    'state',
  ]) {
    expect(callback.searchParams.get(key), key).toBe(params.get(key));
  }
});

test('a signed-in address that is not on the allow-list is a dead end that explains itself', async () => {
  // Neon Auth creates an account for anybody who reaches its sign-in page,
  // so being signed in proves nothing. `ALLOWED_EMAILS` is the control, and
  // the failure has to say so: bouncing this person back to sign in would
  // loop forever, because signing in again is not what is wrong.
  const clientId = await registerClaudeClient();
  const params = authorizeParams({ clientId, challenge: pkce().challenge });

  const result = await openConsent(params, sessionCookie(STRANGER, 'other'));
  expect(result.status).toBe(403);
  expect(result.html).toContain(STRANGER);
  expect(result.html).toContain('ALLOWED_EMAILS');
  // No screen, no form, and above all no code.
  expect(result.html).not.toContain('value="approve"');
});

test('an approve POST from a stranger mints no code, however the form was submitted', async () => {
  // The GET is what renders the screen, but the POST is what mints. A person
  // who reaches the form, loses their session and submits anyway must not be
  // handed a code, so the POST re-checks rather than trusting its own hidden
  // fields.
  const clientId = await registerClaudeClient();
  const params = authorizeParams({ clientId, challenge: pkce().challenge });

  const result = await submitConsent(
    params,
    'approve',
    sessionCookie(STRANGER, 'other'),
  );
  const target = redirectTargetOf(result.html);
  expect(target.searchParams.get('code')).toBeNull();
  expect(target.searchParams.get('error')).toBe('access_denied');

  const noSession = await submitConsent(params, 'approve');
  const noSessionTarget = redirectTargetOf(noSession.html);
  expect(noSessionTarget.searchParams.get('code')).toBeNull();
  expect(noSessionTarget.searchParams.get('error')).toBe('access_denied');
});

test('a redirect_uri the client never registered is refused before anything is minted', async () => {
  // The registered list is the authority. A redirect_uri that merely looks
  // plausible is the attack DCR allow-listing exists to stop, and an
  // authorization code delivered to it is the whole connector handed over.
  const clientId = await registerClaudeClient();
  const params = authorizeParams({
    clientId,
    challenge: pkce().challenge,
    redirectUri: 'https://claude.ai/somewhere-else',
  });

  const shown = await openConsent(params, sessionCookie(OWNER));
  expect(shown.status).toBe(400);
  expect(shown.html).toContain('redirect_uri not registered');

  const submitted = await submitConsent(
    params,
    'approve',
    sessionCookie(OWNER),
  );
  expect(submitted.status).toBe(400);
  expect(submitted.html).not.toContain('code=');

  // And an unknown client is refused the same way.
  const unknown = await openConsent(
    authorizeParams({
      clientId: 'mcp_client_never-registered-here',
      challenge: pkce().challenge,
    }),
    sessionCookie(OWNER),
  );
  expect(unknown.status).toBe(400);
  expect(unknown.html).toContain('Unknown client_id');
});

// ─────────────────────────────────────────────────────────────────────────
// 2. What the screen says
// ─────────────────────────────────────────────────────────────────────────

test('the read-only screen still names the one power that is not behind a scope', async () => {
  // THE LOAD-BEARING SENTENCE ON THIS PAGE. `report_issue` has no scope
  // check — deliberately, because a read-only agent is exactly the one that
  // meets a read tool's bug — so authentication is its only gate, and the
  // argument for that gate is this screen. An owner approving a READ-ONLY
  // connector is handing over the ability to publish text into a public
  // repository under this server's credential, and the screen has to say so
  // or the argument is circular.
  const clientId = await registerClaudeClient();
  const shown = await openConsent(
    authorizeParams({ clientId, challenge: pkce().challenge }),
    sessionCookie(OWNER),
  );
  expect(shown.status).toBe(200);

  expect(shown.html).toContain('GitHub');
  expect(shown.html).toMatch(/Open an issue[\s\S]*public GitHub repository/);

  // No scope was asked for, so the request falls back to read and the write
  // warning must not appear. A warning shown on every screen is a warning
  // nobody reads.
  expect(
    [...shown.html.matchAll(/<span class="scope">([^<]*)<\/span>/g)].map(
      (match) => match[1],
    ),
  ).toEqual(['noble-notations:read']);
  expect(shown.html).not.toContain('write access');
  expect(shown.html).not.toContain('Create recipes and append revisions');

  // And the form is there to be submitted with no JavaScript at all.
  expect(shown.html).toContain('method="POST"');
  expect(shown.html).toContain('value="approve"');
  expect(shown.html).toContain('value="deny"');
});

test('a request for write says plainly that it is write, and what write means here', async () => {
  const clientId = await registerClaudeClient();
  const shown = await openConsent(
    authorizeParams({
      clientId,
      challenge: pkce().challenge,
      scope: 'noble-notations:read noble-notations:write',
    }),
    sessionCookie(OWNER),
  );
  expect(shown.status).toBe(200);

  expect(shown.html).toContain('write access');
  expect(shown.html).toContain('Create recipes and append revisions');
  // The repository's own promise, on the screen where it matters: this
  // connector appends, so approving write is not approving deletion.
  expect(shown.html).toMatch(/Nothing is ever[\s\S]*deleted or overwritten/);
  expect(shown.html).toContain('noble-notations:write');
});

test('a scope the server does not know is dropped, and never shown as granted', async () => {
  // `parseScopeString` drops what it does not recognise and falls back to
  // read. The consequence that matters is on this screen: a client that asks
  // for `admin:everything` must not have that word presented back to the
  // owner as something they are approving.
  //
  // The assertion is on the granted-scope chips rather than on the whole
  // document, and that is not a convenience. The request is echoed verbatim
  // into hidden inputs so the POST can be validated by the same code, so the
  // word is somewhere on the page either way — the property under test is
  // that it is not in the list of things being granted.
  const grantedChips = (html: string): string[] =>
    [...html.matchAll(/<span class="scope">([^<]*)<\/span>/g)].map(
      (match) => match[1]!,
    );

  const clientId = await registerClaudeClient();
  const shown = await openConsent(
    authorizeParams({
      clientId,
      challenge: pkce().challenge,
      scope: 'noble-notations:write admin:everything',
    }),
    sessionCookie(OWNER),
  );
  expect(shown.status).toBe(200);
  expect(grantedChips(shown.html)).toEqual(['noble-notations:write']);

  // And a request made ENTIRELY of unknown scopes falls back to read rather
  // than to nothing, so the screen still describes a real grant — and does
  // not describe a write one.
  const unknownOnly = await openConsent(
    authorizeParams({
      clientId,
      challenge: pkce().challenge,
      scope: 'admin:everything',
    }),
    sessionCookie(OWNER),
  );
  expect(unknownOnly.status).toBe(200);
  expect(grantedChips(unknownOnly.html)).toEqual(['noble-notations:read']);
  expect(unknownOnly.html).not.toContain('write access');
});

test('the client chooses its own name, so the screen escapes it', async () => {
  // Registration is unauthenticated, the client name is free text, and it is
  // printed inside the page that asks a person to approve access. It is the
  // only attacker-controlled string on this screen.
  const clientId = await registerClaudeClient(
    '<script>alert("connector")</script>',
  );
  const shown = await openConsent(
    authorizeParams({ clientId, challenge: pkce().challenge }),
    sessionCookie(OWNER),
  );
  expect(shown.status).toBe(200);
  expect(shown.html).not.toContain('<script>alert');
  expect(shown.html).toContain('&lt;script&gt;');
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Approve, and what the browser is given
// ─────────────────────────────────────────────────────────────────────────

test('approve answers with a document, not a redirect, and carries the code and the state', async () => {
  // `form-action 'self'` in this app's CSP applies to redirects that FOLLOW
  // a form POST, not only to the submission (CSP3 §6.1.18). A 302 from here
  // to claude.ai is therefore dropped by the browser with no error at all —
  // the click appears to do nothing. A document load is not a form
  // submission, so the answer is an HTML page that navigates itself.
  const clientId = await registerClaudeClient();
  const { challenge } = pkce();
  const params = authorizeParams({
    clientId,
    challenge,
    state: 'state-that-must-come-back',
  });

  const approved = await submitConsent(params, 'approve', sessionCookie(OWNER));
  expect(approved.status).toBe(200);
  expect(approved.location).toBeNull();

  const target = redirectTargetOf(approved.html);
  expect(target.origin).toBe('https://claude.ai');
  expect(target.pathname).toBe('/api/mcp/auth_callback');
  expect(String(target.searchParams.get('code'))).toMatch(/^mcp_ac_/);
  // The state is the client's replay defence and it has to come back
  // unchanged, or the client discards a code it asked for.
  expect(target.searchParams.get('state')).toBe('state-that-must-come-back');

  // All three ways out lead to the same address: the meta-refresh for a
  // browser that honours it, the script for one that does not, and the
  // anchor for a person who has to click.
  const withoutEntities = approved.html.replace(/&amp;/g, '&');
  expect(withoutEntities).toContain(`<a href="${target.toString()}"`);
  expect(approved.html).toContain(
    `window.location.replace(${JSON.stringify(target.toString())})`,
  );
});

test('deny sends the client an error rather than leaving the browser on a blank page', async () => {
  const clientId = await registerClaudeClient();
  const params = authorizeParams({
    clientId,
    challenge: pkce().challenge,
    state: 'state-for-the-refusal',
  });

  const denied = await submitConsent(params, 'deny', sessionCookie(OWNER));
  expect(denied.status).toBe(200);

  const target = redirectTargetOf(denied.html);
  expect(target.searchParams.get('error')).toBe('access_denied');
  expect(target.searchParams.get('state')).toBe('state-for-the-refusal');
  expect(target.searchParams.get('code')).toBeNull();
});

// ─────────────────────────────────────────────────────────────────────────
// 4. The code, and what it is worth
// ─────────────────────────────────────────────────────────────────────────

test('a PKCE mismatch burns the code, and a wrong redirect_uri does not', async () => {
  // The asymmetry is the design, and it is worth stating: `consumeAuthCode`
  // marks the row consumed only when client, redirect URI and expiry all
  // match, so a malformed attempt can be retried by the legitimate client.
  // PKCE is verified AFTER the consume, because a verifier mismatch means
  // the code was probably intercepted — and there, burning it is the point.
  const clientId = await registerClaudeClient();

  const stolen = pkce();
  const stolenParams = authorizeParams({
    clientId,
    challenge: stolen.challenge,
  });
  const stolenCode = redirectTargetOf(
    (await submitConsent(stolenParams, 'approve', sessionCookie(OWNER))).html,
  ).searchParams.get('code')!;

  const intercepted = await exchange({
    grant_type: 'authorization_code',
    code: stolenCode,
    redirect_uri: CLAUDE_REDIRECT,
    client_id: clientId,
    code_verifier: randomBytes(32).toString('base64url'),
  });
  expect(intercepted.status).toBe(400);
  expect(intercepted.json.error).toBe('invalid_grant');

  // The real client now arrives with the right verifier, and gets nothing.
  const tooLate = await exchange({
    grant_type: 'authorization_code',
    code: stolenCode,
    redirect_uri: CLAUDE_REDIRECT,
    client_id: clientId,
    code_verifier: stolen.verifier,
  });
  expect(tooLate.status).toBe(400);
  expect(tooLate.json.error).toBe('invalid_grant');
  expect(tooLate.json.access_token).toBeUndefined();

  // The other half: a client that sends the wrong redirect_uri has made a
  // mistake, not been robbed, and its code survives to be spent correctly.
  const honest = pkce();
  const honestParams = authorizeParams({
    clientId,
    challenge: honest.challenge,
  });
  const honestCode = redirectTargetOf(
    (await submitConsent(honestParams, 'approve', sessionCookie(OWNER))).html,
  ).searchParams.get('code')!;

  const mistyped = await exchange({
    grant_type: 'authorization_code',
    code: honestCode,
    redirect_uri: 'https://claude.ai/api/mcp/auth_callback_typo',
    client_id: clientId,
    code_verifier: honest.verifier,
  });
  expect(mistyped.status).toBe(400);
  expect(mistyped.json.error).toBe('invalid_grant');

  const retried = await exchange({
    grant_type: 'authorization_code',
    code: honestCode,
    redirect_uri: CLAUDE_REDIRECT,
    client_id: clientId,
    code_verifier: honest.verifier,
  });
  expect(retried.status).toBe(200);
  expect(String(retried.json.access_token)).toMatch(/^mcp_at_/);
});

test('a code cannot be spent twice, whatever the client does with it', async () => {
  const clientId = await registerClaudeClient();
  const { verifier, challenge } = pkce();
  const params = authorizeParams({ clientId, challenge });
  const code = redirectTargetOf(
    (await submitConsent(params, 'approve', sessionCookie(OWNER))).html,
  ).searchParams.get('code')!;

  const form = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: CLAUDE_REDIRECT,
    client_id: clientId,
    code_verifier: verifier,
  };
  const first = await exchange(form);
  expect(first.status).toBe(200);

  const second = await exchange(form);
  expect(second.status).toBe(400);
  expect(second.json.error).toBe('invalid_grant');
  expect(second.json.access_token).toBeUndefined();
});

// ─────────────────────────────────────────────────────────────────────────
// 5. From the screen to the tool call
// ─────────────────────────────────────────────────────────────────────────

test('what the owner approved is what the token is allowed to do', async () => {
  // The end of the flow, and the only place it can be proved: a token minted
  // by the real consent path, spent on the real MCP endpoint. Scope is
  // re-checked on every tool call, and this is what makes "approve read-only"
  // mean anything at all.
  const clientId = await registerClaudeClient();

  async function approvedToken(scope: string): Promise<string> {
    const { verifier, challenge } = pkce();
    const params = authorizeParams({ clientId, challenge, scope });
    const code = redirectTargetOf(
      (await submitConsent(params, 'approve', sessionCookie(OWNER))).html,
    ).searchParams.get('code')!;
    const result = await exchange({
      grant_type: 'authorization_code',
      code,
      redirect_uri: CLAUDE_REDIRECT,
      client_id: clientId,
      code_verifier: verifier,
    });
    expect(result.status).toBe(200);
    expect(result.json.token_type).toBe('Bearer');
    expect(result.json.scope).toBe(scope);
    return String(result.json.access_token);
  }

  const readOnly = mcpClient(BASE, await approvedToken('noble-notations:read'));
  // It reads.
  const recipe = await readOnly.call<{ slug: string }>('get_recipe', {
    slug: 'baumy-biltong',
  });
  expect(recipe.slug).toBe('baumy-biltong');
  // It does not write, and the refusal names the thing the owner would have
  // to do about it.
  await expect(
    readOnly.call('upsert_category', {
      categoryType: 'technique',
      label: 'A tag a read-only connector must never make',
    }),
  ).rejects.toThrow(/read-only access/i);

  const readWrite = mcpClient(
    BASE,
    await approvedToken('noble-notations:read noble-notations:write'),
  );
  // The same call, on a token the owner approved for write, gets past the
  // scope check and is refused for a reason that is about the data instead.
  await expect(
    readWrite.call('upsert_category', {
      categoryType: 'technique',
      label: 'A tag whose parent does not exist',
      parentSlug: 'no-such-parent-for-the-consent-spec',
    }),
  ).rejects.toThrow(/No tag "no-such-parent-for-the-consent-spec"/);
});
