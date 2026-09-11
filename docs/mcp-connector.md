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
    │                                                     302 → /sign-in?callbackURL=…
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
`loginUrl: '/sign-in'`, a return trip landing on `/sign-in?…verifier=…`
would be served as an ordinary page and no cookie would ever be minted. The
hosted flow is therefore pointed at `/connect/done`, a path outside the
sign-in subtree, which forwards to the real destination once the cookie
exists. See `src/lib/auth-routes.ts`. The former names, `/auth` and
`/oauth-return`, both redirect permanently to these and keep their query
string, so a `redirect_uri` still in flight survives the rename.

## Scopes

| Scope                   | Grants                                                                                                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `noble-notations:read`  | Every read tool                                                                                                                                                                     |
| `noble-notations:write` | `create_recipe`, `revise_recipe`, `backfill_revision`, `add_note`, `add_mass_flow`, `describe_mechanism`, `upsert_ingredient`, `upsert_category`, `log_experiment`, `reattach_note` |

`report_issue` is in neither scope. It needs authentication and nothing
else, so a read-only connector can file a report — a read-only agent is
exactly the one that meets a read tool's bug. See § Reporting a fault.

The consent screen names which scope is being requested and warns explicitly
when write is included. It also names the reporting capability, under both
scopes, because that tool is not behind either one. Scope is re-checked on
every tool call, not just at authorization.

## Tools

Read: `get_started`, `search_recipes`, `get_recipe`, `list_categories`,
`list_ingredients`, `get_ingredient`, `list_experiments`, `get_experiment`,
`search_notes`, `build_shopping_list`, `get_repository_stats`.

Write: `create_recipe`, `revise_recipe`, `backfill_revision`, `add_note`,
`add_mass_flow`, `describe_mechanism`, `upsert_ingredient`,
`upsert_category`, `log_experiment`, `reattach_note`.

Neither: `report_issue`.

`list_experiments`, `get_experiment` and `log_experiment` speak of
experiments; the website calls the same record a batch log and serves it at
`/batch-logs`. The guide's `theWebsite` section teaches an agent the
mapping, because one that knew only the tool word reported the page as
missing.

Twenty-two tools. `/connect` and `TOOLS` in `e2e/mcp-contract.spec.ts` name the
same set; a tool that appears or disappears without all three moving is
drift, and that test is the line that says so.

Tool descriptions are the only instructions the model gets, and they are
written to push toward revising rather than duplicating — `create_recipe`
says to search first and reach for `revise_recipe` if the dish exists.

### The three tools that reach a stored record

`add_mass_flow` and `describe_mechanism` are the odd pair. Every other
write tool makes a record or appends one; these two name a record that is
already stored and fill one field on it.

They exist because two fields arrived after the archive was already in the
database. D-02 added `notes.conditions` — the values a mechanism holds
under, which R-SCR-41 requires to stay separate — and D-12 added the mass
flow tables behind R-SCR-39. No other path reaches a stored revision:
`pnpm ingest` skips a recipe that exists, `--force` appends revisions
rather than filling columns on stored ones, and a revision whose only
change is a diagram has no rationale and would move a number that is in
URLs and in the `nn:checked:{slug}:{revision}` keys.

`reattach_note` is the third, and a different shape: it moves a note from
one record to another. Nothing a reader reads changes — the kind, title,
body, conditions, sources and date are all left exactly as they were, and
only which record holds the note is different. A note's TEXT being fixed
does not make its LOCATION fixed, and the choice of parent is usually
forced by what happens to exist yet: a note about a dish gets attached to a
batch because no recipe for the dish has been written. Before this tool
that note was stranded, and the only repair was to write it a second time
on the recipe, which duplicates the text and lets the two copies drift.
`log_experiment` has always re-homed a run the same way.

A note pinned to one revision is refused rather than moved. That note is a
statement about that version, and moving it would make a stored version say
something it never said — which is the revision rule itself.

The move is recorded, not silent. `notes.previous_subjects` keeps every
record the note has hung off, oldest first. The audit log cannot carry that
fact: `runTool` builds its audit row from the arguments the tool was called
with, so it can name where a note went and never where it came from. The
concurrency answer is `describe_mechanism`'s — lock the row, then repeat
the guard in the UPDATE's own WHERE, so two callers racing cannot both
believe they moved it.

Neither is an update path in the sense the revision rule forbids. Each
fills a field that has never held a value, so it can only turn absent into
present — and R-SCR-39 makes the figure optional, so a revision without one
is already rendered correctly. Each refuses a second write, which is what
keeps a measurement from being quietly replaced. The answer to a wrong
condition is a note of kind `correction`, exactly as it is for a wrong note.

**The two refusals are enforced differently, and the second one had to be.**
`add_mass_flow` reads the stored row so the caller is told what is already
there, and `uq_mass_flow_revision` catches the case the read cannot: two
callers at once. `describe_mechanism` has no index of that shape available
— the field is an array column on a row that already exists — so a plain
read-then-write would have been advisory only. Under READ COMMITTED two
connectors describing the same note both read an empty list, both pass the
guard, and the second overwrites the first. The connector is multi-client
by design, so the read takes `FOR UPDATE` and the `UPDATE` repeats the
emptiness test in its own `WHERE` clause. See `describeMechanism` in
`src/lib/queries/write.ts`.

When a new record is being written, the fields ride along instead:
`massFlow` on `create_recipe`, `revise_recipe` and `backfill_revision`, and
`conditions` on any note. `massFlow` is deliberately **not** carried
forward by `revise_recipe`, because it records what one batch weighed and
copying it into a version nobody weighed would invent a measurement.

## Reporting a fault

`report_issue` is the one tool whose effect lands outside this system. It
opens an issue on `RyRy79261/noble-notations`, which is public.

It exists because an agent hit six problems with this connector and had no
way to tell anybody. The owner copied the report out of a chat and pasted it
to a developer; seven agents then reproduced every claim, and three were
wrong. Every one of those errors was the same error — the report carried a
**memory** of what happened instead of the **evidence**. So the tool is not a
feedback box. It captures four things at the moment of failure: the tool that
was called, the payload that was sent, the response that came back, and the
commit that is deployed. The server supplies the last one, because the report
that created this tool named the wrong commit.

**The repository is hardcoded** in `src/lib/github/config.ts`. There is no
`repo` argument, no `GITHUB_REPO` variable, and every URL in
`src/lib/github/` is built from one constant. The token would refuse a
foreign repository anyway, but the refusal is the wrong place for the
control: an agent must not be able to name a target at all.

**`GITHUB_ISSUE_TOKEN` is the credential, and it is the whole of the setup.**
Mint a **fine-grained** personal access token with:

| Setting           | Value                            |
| ----------------- | -------------------------------- |
| Repository access | Only `RyRy79261/noble-notations` |
| Issues            | Read and write                   |
| Metadata          | Read                             |
| Everything else   | No access                        |

Do not use a classic token with the `repo` scope. Every approved connector
can reach this endpoint, and a `repo` token would make that endpoint a way to
read private code and push to it.

**Create five labels before the first report.** GitHub answers `422` for a
label that does not exist, the report is lost, and the message an agent then
reads says so. The labels are `agent-report` — on every report, and what the
dedup and the cap count — plus one per kind: `report:bug`,
`report:unclear-docs`, `report:missing-capability`, `report:idea`.

**Without the token the tool is not registered.** It is absent from
`tools/list`, the server instructions and `get_started` stop naming it, and
the server prints one warning. A registered-but-broken `report_issue` would
be strictly worse than no tool, because an agent would file into a void and
consider the problem reported.

**What stops an agent filling the tracker.** Three limits, and the second is
the one that is easy to forget:

- Ten open agent reports at a time. Closing the backlog restores capacity.
- Three comments for one fault. A repeat of the same title comments on the
  open issue instead of filing again — the second occurrence is worth having,
  because its commit and its payload may differ — and the fourth is refused.
- Five reports an hour for one principal, on the degraded path only, where
  the issues list could not be read and the first limit could not be counted.

The first two are counted from GitHub and from this process. Vercel runs many
instances, so the per-process halves bound one instance, not the deployment.
A hard global bound would need a shared store beside `mcp_audit_log`.

**What is done to the text before it is published.** The agent's prose is
escaped so it cannot form Markdown structure, wrapped so every mention and
cross-reference sits in a code span, and quoted so a reader can tell it from
the server's facts. `payload` and `response` go in a fenced block, byte for
byte. Everything is passed through a credential redactor first, and the
number of removals is reported in the issue and to the caller. The redactor
is a blocklist: it removes what matches a known pattern, and every sentence
written about it says so.

**`GITHUB_API_BASE_URL` is a test seam.** `e2e/github-stub.ts` answers on it,
which is what makes "never call the real GitHub API" a property of the
network layer rather than of discipline. It is honoured only when it names a
loopback host, because a live override on a deployment would send this
credential, as a bearer header, to whatever host it names.

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
