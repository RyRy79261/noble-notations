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

| Scope                   | Grants                                                                                                                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `noble-notations:read`  | Every read tool, including `list_deleted`                                                                                                                                                                                                                                 |
| `noble-notations:write` | `create_recipe`, `revise_recipe`, `backfill_revision`, `add_note`, `add_mass_flow`, `describe_mechanism`, `upsert_ingredient`, `upsert_category`, `log_experiment`, `reattach_note`, `update_recipe`, `update_revision`, `update_note`, `delete_record`, `restore_record` |

**`list_deleted` is a read, and it is in the read scope.** It reports rows
the public site does not show, which is why that looks wrong at first
glance. Three things settle it: the read scope already grants a recipe whose
status is `archived`; `ALLOWED_EMAILS` means a single administrator approves
every connector, so there is no second audience to withhold it from; and the
caller who most needs it is the read-only one that arrives after a delete
and has to find out what is missing and whether it is recoverable. Behind
write, that agent would see an absence and never learn it was reversible.

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
`search_notes`, `build_shopping_list`, `get_repository_stats`,
`list_deleted`.

Write: `create_recipe`, `revise_recipe`, `backfill_revision`, `add_note`,
`add_mass_flow`, `describe_mechanism`, `upsert_ingredient`,
`upsert_category`, `log_experiment`, `reattach_note`, `update_recipe`,
`update_revision`, `update_note`, `delete_record`, `restore_record`.

Neither: `report_issue`.

`list_experiments`, `get_experiment` and `log_experiment` speak of
experiments; the website calls the same record a batch log and serves it at
`/batch-logs`. The guide's `theWebsite` section teaches an agent the
mapping, because one that knew only the tool word reported the page as
missing.

Twenty-eight tools. `/connect` and `TOOLS` in `e2e/mcp-contract.spec.ts` name
the same set; a tool that appears or disappears without all three moving is
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
something it never said — which is the revision rule itself. `update_note`
is the one way past that refusal, and it is the right one: it is the tool
for a record that is WRONG, and a note filed against a version it was never
about is wrong rather than moved.

`update_note` therefore writes what a move writes. It sets `sort_at`, so a
note written years ago does not land at the front of its new subject's list
and renumber the mechanisms below it, and it appends the home the note is
leaving to `previous_subjects` when that home has one of the three forms the
column stores. Two tools can move a note and they leave the same trail
behind; the difference between them is the question at the top of this file,
not the bookkeeping.

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
keeps a measurement from being quietly replaced.

**Their one-shot promise is now local to them, and their refusals had to
move.** Both still refuse a second write, and that is still the point of
their shape: neither of these two tools can replace a measurement. What
changed is that the repository has a general correction path.
`update_revision` replaces a stored mass flow figure and `update_note`
replaces a stored set of conditions, so the old refusals — "this cannot be
changed", "they cannot be changed" — became false in the one place a model
has no way to check. They now name the tool that does it:

- `writeMassFlow`: _"…This tool does not replace a figure: it records what a
  batch weighed. To record a different batch, call revise_recipe and send the
  figure with it. To correct a figure that is wrong, call update_revision."_
- `describeMechanism`, on both the read guard and the `WHERE`-clause
  backstop: _"…This tool does not replace them. To correct them, call
  update_note. To leave the old claim readable, add a note of kind
  'correction' that says so."_

Both tools stay registered. They are the ergonomic path for filling one
field on a stored record, and they are the only path an agent finds by name
when that is what it wants to do.

A note of kind `correction` is still a different act from correcting the
note, and both are still right. The correction note leaves the old claim
readable, which is what you want when somebody acted on it. `update_note` is
the statement that the stored text was never true.

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

## Documents

A tool is something a model DOES. A resource is something it READS, and a
client offers it as a document to load rather than as an action to take.
The connector serves one:

| URI                               | What it is                                  |
| --------------------------------- | ------------------------------------------- |
| `noble-notations://writing-style` | The writing rule, as a document of its own. |

It is `text/markdown`, it is behind `noble-notations:read`, and it is the
same text `get_started` returns as `howToWrite` with a title on it. The
reason it exists as a resource as well as a field of the guide: an agent
that wants the house style should not have to pull the whole eighteen-section
guide back to get it, and a client that can pin a document can keep the rule
in context for a whole session.

**The read scope, not the write scope.** The agent that most needs the
writing rule is the one about to be granted write access, and it reads this
before that happens. A document stating how to write discloses nothing about
the archive.

**The text is in TypeScript, not read from `.claude/`.**
`.claude/skills/writing-style/SKILL.md` states the same rule for a person
working in the repository, and this connector does not read it. Next traces
the files a route needs from its imports, and a path built at runtime traces
nothing — `.claude/` would not be in the Vercel bundle, so a connector that
read the skill file would fail in production while passing every local test.
The two copies are held together by `e2e/writing-style.spec.ts`, which
enumerates the rules and fails naming the one that drifted.

Resources are not tools and they do not move the tool count: the registry
still holds twenty-nine. `resources/list` advertises this document and
`resources/read` serves it.

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
