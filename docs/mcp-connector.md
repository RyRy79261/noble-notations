# MCP connector

Noble Notations exposes its repository over the Model Context Protocol, so a
Claude conversation can search what is already recorded and append revisions
to it directly. This document is the design reference; `/connect` on the site
is the short version for setting it up.

## Endpoint

```
https://noble-notations.ryanjnoble.dev/api/mcp/mcp
```

The doubled `mcp` is correct: `mcp-handler` is mounted with
`basePath: '/api/mcp'` and the route file sits at `[transport]/route.ts`, so
the transport segment resolves to `mcp`.

## Why OAuth and not a bearer token

claude.ai's custom-connector dialog has nowhere to paste a static token. It
performs RFC 7591 Dynamic Client Registration, then an OAuth 2.1
authorization-code flow with PKCE. So the full stack is required for the web
client, even though Claude Code and Claude Desktop could have managed with a
token.

## Flow

```
claude.ai                         noble-notations
    │
    ├─ GET /.well-known/oauth-protected-resource ──────►  which auth server?
    ├─ GET /.well-known/oauth-authorization-server ───►  endpoints + S256
    ├─ POST /api/mcp/oauth/register ──────────────────►  client_id (DCR)
    │
    ├─ browser: GET /api/mcp/oauth/authorize?… ───────►  no admin session?
    │                                                     302 → /auth?callbackURL=…
    │                                                     sign in, bounce back
    │                                                     render consent screen
    ├─ browser: POST (Approve) ───────────────────────►  mint auth code
    │  ◄──────────────── HTML redirect with ?code=&state=
    │
    ├─ POST /api/mcp/oauth/token (code + verifier) ───►  access + refresh token
    └─ POST /api/mcp/mcp  Authorization: Bearer …  ───►  tools
```

## Identity

The authorize endpoint has to know who is approving a connector. Identity
comes from **Neon Auth** — the same provider that backs the database — so
there is no second account system to provision. `src/lib/neon-auth.ts` holds
the server instance; `src/lib/mcp/admin-session.ts` answers "is an
authorised administrator present?" and is the only thing the OAuth stack
consults.

- `NEON_AUTH_BASE_URL` — injected by Vercel's Neon Auth integration. Older
  provisionings named it `NEON_AUTH_URL`; either is accepted.
- `NEON_AUTH_COOKIE_SECRET` — session cookie signing key, 32+ characters.
  **Not** injected by Vercel: set it yourself in every environment.
  `openssl rand -base64 48`. Rotating it signs everyone out.
- `ALLOWED_EMAILS` — comma-separated allow-list of addresses that may
  approve connectors.

Being signed in is necessary but not sufficient. Neon Auth will create an
account for anyone who reaches its hosted sign-in page, so `ALLOWED_EMAILS`
is the control that matters; an empty list means nobody can approve
anything. A signed-in address that is not on the list gets a 403 explaining
why, rather than being bounced back to sign in forever.

### Two traps in the sign-in round trip

**The verifier exchange lives in the middleware.** Neon Auth's hosted
sign-in returns the browser with `?neon_auth_session_verifier=…` and no
cookie yet. Exchanging that token for a real session cookie happens inside
`auth.middleware()` — it is _not_ part of `auth.handler()` and cannot be
triggered from a route handler. `src/middleware.ts` exists for that alone
and is scoped to two paths; nothing else on this site is behind a login.

**`loginUrl` is skipped before the exchange runs.**
`processAuthMiddleware` early-returns `allow` for any path at or under the
configured `loginUrl` _before_ it reaches the verifier step. With
`loginUrl: '/auth'`, a return trip landing on `/auth?…verifier=…` would be
served as an ordinary page and no cookie would ever be minted. The hosted
flow is therefore pointed at `/oauth-return`, a sibling path, which
forwards to the real destination once the cookie exists. See
`src/lib/auth-routes.ts`.

## Scopes

| Scope                   | Grants                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `noble-notations:read`  | Every read tool                                                                     |
| `noble-notations:write` | `create_recipe`, `revise_recipe`, `add_note`, `upsert_ingredient`, `log_experiment` |

The consent screen names which is being requested and warns explicitly when
write is included. Scope is re-checked on every tool call, not just at
authorization.

## Tools

Read: `search_recipes`, `get_recipe`, `list_taxonomy`, `list_ingredients`,
`get_ingredient`, `list_experiments`, `get_experiment`,
`get_repository_stats`.

Write: `create_recipe`, `revise_recipe`, `add_note`, `upsert_ingredient`,
`log_experiment`.

Tool descriptions are the only instructions the model gets, and they are
written to push toward revising rather than duplicating — `create_recipe`
says to search first and reach for `revise_recipe` if the dish exists.

## Hard-won details

These are the specific wrong assumptions that break this stack in ways that
are hard to diagnose. Most were paid for once already in the `intake-tracker`
implementation this one is ported from.

**`VERCEL_URL` is the wrong issuer.** It is the deployment-hash domain, and
on a production deployment that URL sits behind Vercel SSO. Advertise it in
OAuth metadata and claude.ai follows it into a 403. `getPublicOrigin()`
prefers `MCP_PUBLIC_URL`, then the request's `x-forwarded-host`, and only
falls back to `VERCEL_URL` when there is no request at all.

**`form-action 'self'` silently kills the consent redirect.** CSP3 §6.1.18
applies `form-action` to redirects that follow a form POST, not just the
initial submission. A 302 from the approve handler to claude.ai is dropped by
the browser with no error — the click appears to do nothing. The authorize
route returns an HTML document with a meta-refresh and a scripted navigation
instead; a document load is not a form submission.

**`WWW-Authenticate` must be CORS-exposed.** The 401 carries
`Bearer resource_metadata="…"`, which is how a browser client discovers where
to authorize. Unexposed, it cannot be read cross-origin and the connector
dead-ends.

**`DELETE` must be in the preflight allow-list.** It is MCP Streamable HTTP
session termination. Omit it and browsers block the request before it
arrives.

**`.well-known` needs a rewrite.** RFC 8414 and RFC 9728 require those exact
paths, and the App Router will not route a dot-prefixed folder. See
`next.config.ts`.

**The Neon HTTP driver has no transactions.** `drizzle-orm/neon-http` throws
on `transaction()`. All the OAuth state changes here are single statements
with every predicate in the WHERE clause; the recipe writes use the Neon
WebSocket pool instead (`withTransaction`).

**A PKCE mismatch burns the code.** `consumeAuthCode` marks the row consumed
only when client, redirect URI and expiry all match, so a malformed attempt
can be retried — but PKCE is verified after the consume. A verifier mismatch
means the code was probably intercepted, and there burning it is the point.

**A CDN in front of Vercel may block discovery.** Cloudflare Bot Fight Mode
and Vercel Firewall DDoS mitigation both catch claude.ai's probes, which are
bots. If discovery works in a browser but Claude cannot reach the server,
allow `/api/mcp/*` and `/.well-known/oauth-*` through.

## Verification

```bash
# Discovery — issuer must be the custom domain, not *.vercel.app
curl -s https://<host>/.well-known/oauth-authorization-server | jq .issuer
curl -s https://<host>/.well-known/oauth-protected-resource | jq .

# 401 must carry the resource_metadata hint
curl -si -X POST https://<host>/api/mcp/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | grep -i www-authenticate

# DCR must reject a foreign redirect_uri
curl -s -X POST https://<host>/api/mcp/oauth/register \
  -H 'Content-Type: application/json' \
  -d '{"client_name":"x","redirect_uris":["https://evil.example.com/cb"]}'
```

Then add the connector in claude.ai → Settings → Connectors, approve the
consent screen, and ask a new chat what the connector can see.
