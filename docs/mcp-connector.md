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

| Scope                   | Grants                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `noble-notations:read`  | Every read tool, including `list_deleted`                                                                                                                                                                                                                                                                                           |
| `noble-notations:write` | `create_recipe`, `create_variant`, `revise_recipe`, `backfill_revision`, `add_note`, `add_mass_flow`, `describe_mechanism`, `upsert_ingredient`, `upsert_category`, `log_experiment`, `reattach_note`, `update_recipe`, `update_revision`, `update_note`, `delete_record`, `restore_record`, `upload_image`, `request_image_upload` |

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

Write: `create_recipe`, `create_variant`, `revise_recipe`,
`backfill_revision`, `add_note`, `add_mass_flow`, `describe_mechanism`,
`upsert_ingredient`, `upsert_category`, `log_experiment`, `reattach_note`,
`update_recipe`, `update_revision`, `update_note`, `delete_record`,
`restore_record`, `upload_image`, `request_image_upload`.

Neither: `report_issue`.

**Three of those are conditional, and the count is therefore a range.**
`report_issue` is registered only when `GITHUB_ISSUE_TOKEN` is set, and
`upload_image` and `request_image_upload` only when `BLOB_READ_WRITE_TOKEN`
is; both are set in
Production and Preview and neither is on a developer's machine. A tool that
is advertised and cannot work is worse than one that is absent, because an
agent calls it, fails, and cannot tell a misconfiguration from a fault in
its own arguments. The guide follows the same predicates — `get_started`
describes the two image tools only where they exist, and the write-tool
count in its `scopes` section is eighteen or sixteen accordingly.

`list_experiments`, `get_experiment` and `log_experiment` speak of
experiments; the website calls the same record a batch log and serves it at
`/batch-logs`. The guide's `theWebsite` section teaches an agent the
mapping, because one that knew only the tool word reported the page as
missing.

Thirty-one tools, fully configured. `/connect` and `TOOLS` in
`e2e/mcp-contract.spec.ts` name the same set; a tool that appears or
disappears without all three moving is drift, and that test is the line that
says so. (`create_variant` reached the registry, `/connect` and that test
without reaching the two lists above, which is exactly the drift this
paragraph warns about; it is named in both now.)

Tool descriptions are the only instructions the model gets, and they are
written to push toward revising rather than duplicating — `create_recipe`
says to search first and reach for `revise_recipe` if the dish exists.

### Images, and why the stored address is ours

`upload_image` is the answer to issue #54, and the shape of the answer is
worth writing down because it is not the obvious one.

Every image field in this repository — `recipes.hero_image_url`,
`recipe_steps.image_url`, and the three added with this tool — takes an
ADDRESS, and nothing in the connector could make one. An agent that had just
been sent a photograph held bytes. It had no address for them and no way to
mint one, so the field was reachable in theory and unreachable in practice:
the person had to leave the conversation, host the file somewhere and come
back with a link. Most pictures were therefore never added.

The bytes go to Vercel Blob. The ROW goes in `images`, the seventh
soft-deletable table, and what a recipe stores is `/images/<id>` — this
site's own address, never the blob's.

That last part is the decision everything else follows from. The reference
from a recipe to a picture is a text column and not a foreign key, and it
always was, because a recipe may legitimately point at a picture on somebody
else's site. So deleting an image row can do nothing about the rows naming
it. If the stored value were the blob address, a deleted picture would keep
rendering on every page that referenced it, and the only fix would be a
delete that rewrote rows across four tables and inside stored revisions — a
cascade that edits versions people cooked from, in order to hide a
photograph. Serving from `/images/[id]` instead makes that cascade
unnecessary: the route reads `images_live`, so a deleted row is a 404
everywhere at once and a restore brings every reference back whole.

The address is stored RELATIVE, for the reason the guide keeps its own
addresses relative: `NEXT_PUBLIC_SITE_URL` is set nowhere here, so an
absolute address built at write time would name the production host and be
wrong on every preview deployment — permanently, in a stored row.

What this does not buy: a Vercel blob is public, the SDK has no other access
mode, so somebody who kept the blob address can still fetch a deleted
picture. The path carries a random suffix and the `images` row is the only
place it is written down, so "deleted" here means the picture leaves the
site and the tools, not that the bytes are destroyed. Nothing in this
repository destroys bytes, and `restore_record` is exact because of it.

**There is no `delete_image`, and the issue asked for one.** This repository
has one delete and it is soft, so `image` is the seventh kind
`delete_record` and `restore_record` take. A second delete verb would have
needed a second undo beside it, and then two answers to "how do I get it
back" — which is the confusion AGENTS.md § _It is not called archive_ spends
a table avoiding. `upload_image` says so in its own description, and
`e2e/auth-guide.spec.ts` carries `delete_image` in its `NOT_TOOLS` set so
that sentence is allowed to name a tool that does not exist.

Four smaller decisions, each of which the issue left open:

- **Size.** Both, not either. Anything over 25 MB is refused and the
  refusal names the limit; everything under it is resized to 2400 pixels on
  the longest edge and re-encoded to WebP, without comment, with smaller
  copies beside it (see _Getting a photograph in_ below). Refusing alone
  puts the work back on the agent, which is the friction the issue was filed
  about; resizing alone means an unbounded decode, so there is a pixel
  ceiling as well as a byte one.
- **Revisions.** A hero image is on the recipe and not on a version, so
  setting one makes no version and moves no number. A step picture IS inside
  a stored version, and writing one is a correction to it — allowed, because
  a photograph is not a statement that the food changed, but it changes what
  every reader of that version sees. Both tool descriptions say so.
- **Replacement.** A second upload to a record replaces its picture; a
  second upload to a run's gallery appends. `upload_image` is the one path
  in the write layer that appends to a list rather than replacing it, and it
  has to be: an agent holding one new photograph does not hold the other
  four.
- **De-duplication.** By the sha256 of the ENCODED result. A person sends
  the same photograph twice in a conversation more often than not, and two
  rows would mean two blobs, two bin entries and two ids for one picture.
  The second call still attaches, and still updates the alt text: only the
  bytes were already known.

### Getting a photograph in without the model holding it

Issues #56 and #58. `upload_image` shipped taking the picture as `data`, a
base64 string, and that is correct for what an MCP call is: JSON, with no
binary channel. The fault was who writes that string. **The model writes the
tool call**, so every base64 character is a token the model emits. A phone
photograph is two to five megabytes, which is three to seven million
characters. No chat can send one, and trying fills the context window before
it fails. One agent measured it: to get a 2.7 MB photograph under 100 000
characters it had to shrink it to 640 pixels wide, and the server then
stored a picture far smaller than the one it is built for.

So the bytes must travel without the model. There are now three ways in,
chosen by where the picture is:

| The picture is               | The way in                          | What the model sends  |
| ---------------------------- | ----------------------------------- | --------------------- |
| a photograph the person has  | `request_image_upload`, then a link | a slug and a sentence |
| on the public web            | `upload_image { sourceUrl }`        | an https address      |
| small, and made by the agent | `upload_image { data, mimeType }`   | the base64 itself     |

**`request_image_upload` returns a link.** The agent names the record in
`attachTo` and gives the person the link; the person opens it on the phone
that took the picture and picks the file. The model handles about a hundred
characters, whatever the size of the photograph.

- **The target is checked when the link is made.** `probeAttachTarget` runs
  the real `attachImage` inside a savepoint and rolls it back, so every
  refusal the finished upload could meet — no such recipe, a deleted run,
  step 9 of six — is met in the tool call, where the agent can fix it. A
  set of separate reads would be a second copy of those rules.
- **The link is the credential.** Nobody signs in on the page. The token is
  32 random bytes and only its sha256 is stored (`image_uploads`), it lasts
  one hour, and the first picture to land spends it. Only a connector with
  the write scope can mint one, and it names one record. The page is
  `noindex` and sends no referrer.
- **The page sends the photo to this site, not to the blob store.** It
  PUTs the file to `/api/uploads/<token>`, the same route an agent with a
  shell uses, and the server processes it exactly as `upload_image` would,
  stores it and spends the link. A Vercel function refuses a request body
  over 4.5 MB, so a file over 4 MB is first redrawn in the browser at 2400
  pixels on its longest edge — the size of the largest copy the store keeps
  — as a JPEG (`src/lib/images/shrink-in-browser.ts`). A file under 4 MB,
  which is most phone photographs, is sent as taken.
  The first design sent the original from the browser straight to Vercel
  Blob with a client token. From a phone in production that cross-origin
  request failed every time — first a freeze, then "Failed to fetch" in a
  second — and nothing in this repository can prove what another origin
  answers to a preflight. `/api/uploads/<token>/token` and `/complete` still
  exist and are tested, but the page no longer calls them.
- **Spending the link and storing the picture are one transaction.** The
  row is locked `FOR UPDATE`, so two tabs finishing at once store one
  picture; the second is told the link is used.
- **`accept` names four types and not `image/*`.** That is what makes
  Safari on an iPhone hand over a JPEG instead of a HEIC, which `sharp`
  cannot decode.
- **An agent with a shell can use the same link.** The result carries
  `putUrl`; an HTTP PUT with the file as the body stores it. That path is
  bounded by the 4.5 MB body limit, and the description says to shrink to
  2400 pixels first, which loses nothing because 2400 is the largest copy
  kept.

**`sourceUrl` is a request forgery surface, and `fetch-remote.ts` is guarded
accordingly.** https only; no user info; at most three redirects, each
re-checked; the body capped while it streams; a 15 second timeout. The
address check runs on what the name RESOLVES to, inside the socket's own DNS
lookup, against every private, loopback, link-local and reserved range in
both families — checking the name and letting the socket resolve it again is
the rebinding hole. A literal IP is checked separately, because Node does
not call the lookup for one. The refusal names the address and says why.

**Every picture now has smaller copies.** `sharp` makes 480, 960 and 1600
pixel wide copies beside the 2400 pixel one, at upload, and stores them in
`images.renditions`. `/images/<id>?w=960` redirects to the narrowest copy at
least that wide, and the site's `<img>` tags carry a `srcset` naming them,
so a phone fetches a small file and a 2× laptop a large one. They are made
once rather than by the Next.js image optimiser on each cache miss, because
the answer never changes. A picture stored before this has no copies and
answers every width with its one file.

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
still holds thirty-one. `resources/list` advertises this document and
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
