import { spawn } from 'node:child_process';
import path from 'node:path';
import { Client } from 'pg';
import { test, expect } from '@playwright/test';
import { mcpClient, tokens } from './helpers';
import {
  STUB_DEFAULT_PORT,
  STUB_ISSUES_PATH,
  STUB_LEAK_MARKER,
  type StubIssue,
  type StubRequest,
  type StubState,
} from './github-stub-contract';
import { issueReportingConfigured } from '../src/lib/github/config';

/**
 * `report_issue` — the one tool whose effect lands outside this system.
 *
 * It exists because an agent hit six problems with this connector and had no
 * way to tell anybody. Seven agents then reproduced every claim and three
 * were wrong, always the same way: the report carried a MEMORY of what
 * happened instead of the EVIDENCE. So these tests are not about whether a
 * report is filed. They are about whether the four things that settle a
 * report — the tool, the payload, the response, the deployed commit — arrive
 * intact, and about the four ways this tool could hurt somebody: aiming the
 * server's credential at another repository, notifying a stranger, leaking a
 * credential into a public place, and filling the issue list.
 *
 * NOTHING HERE REACHES api.github.com. `e2e/github-stub.ts` answers instead,
 * because `playwright.config.ts` points `GITHUB_API_BASE_URL` at it. Every
 * assertion below is on what the server *was about to send*, read back out
 * of the stub's recording. If the base URL were ever misconfigured, the stub
 * would record nothing and every one of these tests would fail — which is
 * the point: the guarantee is enforced, not promised.
 *
 * A separate file rather than an append to `e2e/mcp-contract.spec.ts`: that
 * file runs one serial block sharing a database, and these share a stub that
 * is reset before each test. `workers: 1, fullyParallel: false` already
 * serialises files, so the isolation costs nothing. These tests are
 * deliberately NOT serial — a failure in one must not skip the rest, because
 * each covers a different way the tool can do harm.
 */

const STUB = `http://127.0.0.1:${Number(
  process.env.E2E_GITHUB_PORT ?? STUB_DEFAULT_PORT,
)}`;

/** Set on the app server by `playwright.config.ts`. */
const E2E_COMMIT = '65d93a6e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e';
const E2E_BRANCH = 'e2e-report-issue';

interface Filed {
  status: 'filed';
  issueNumber: number;
  url: string;
  fingerprint: string;
  commit: string | null;
  redactions: number;
  duplicateCheckRan: boolean;
  previousIssueNumber?: number;
  message: string;
}

interface Commented {
  status: 'commented';
  issueNumber: number;
  url: string;
  commentUrl: string;
  fingerprint: string;
  redactions: number;
  message: string;
}

interface Capped {
  status: 'capped';
  reason: string;
  openReports?: number;
  limit: number;
  url: string;
  message: string;
}

type Outcome = Filed | Commented | Capped;

function agent(token = tokens().readWrite) {
  return mcpClient('http://127.0.0.1:' + (process.env.E2E_PORT ?? 3100), token);
}

async function resetStub(): Promise<void> {
  const response = await fetch(`${STUB}/__reset`, { method: 'POST' });
  expect(
    response.ok,
    'the GitHub stub must be reachable — if it is not, the server may be ' +
      'pointed at the real api.github.com',
  ).toBeTruthy();
}

async function programStub(next: Partial<StubState>): Promise<void> {
  const response = await fetch(`${STUB}/__state`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(next),
  });
  expect(response.ok).toBeTruthy();
}

async function stubRequests(): Promise<StubRequest[]> {
  const response = await fetch(`${STUB}/__requests`);
  const payload = (await response.json()) as { requests: StubRequest[] };
  return payload.requests;
}

async function created(): Promise<StubRequest[]> {
  return (await stubRequests()).filter(
    (r) => r.method === 'POST' && r.path === STUB_ISSUES_PATH,
  );
}

async function commented(): Promise<StubRequest[]> {
  return (await stubRequests()).filter(
    (r) => r.method === 'POST' && r.path.endsWith('/comments'),
  );
}

/**
 * The `instructions` field of an `initialize` result, as text.
 *
 * Read raw rather than through `mcpClient`, which starts its session and
 * throws the initialize body away. The whole response is returned because
 * the assertion is about a word being present or absent, and the framing —
 * JSON or SSE — is not the subject.
 */
async function instructionsOf(base: string): Promise<string> {
  const response = await fetch(`${base}/api/mcp/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${tokens().readWrite}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'noble-notations-e2e', version: '0' },
      },
    }),
  });
  const text = await response.text();
  expect(text).toContain('cooking store that keeps versions');
  return text;
}

/** A complete bug report: the three always-required fields and the evidence. */
function bugReport(overrides: Record<string, unknown> = {}) {
  return {
    title: 'get_recipe returns 500 for a slug that exists',
    body:
      'I called get_recipe with a slug that search_recipes had just given ' +
      'me. It answered with an internal error. A correct answer is the ' +
      'recipe, or a NotFound that names the slug.',
    kind: 'bug',
    toolName: 'get_recipe',
    payload: '{"slug":"dan-dan-noodles"}',
    response: 'An internal error occurred while processing your request.',
    ...overrides,
  };
}

test.beforeEach(async () => {
  await resetStub();
});

// ─────────────────────────────────────────────────────────────────────────
// 1. The evidence arrives
// ─────────────────────────────────────────────────────────────────────────

test('a bug report reaches GitHub with the four pieces of evidence', async () => {
  const result = await agent().call<Outcome>('report_issue', bugReport());
  expect(result.status).toBe('filed');
  const filed = result as Filed;

  const posts = await created();
  expect(posts).toHaveLength(1);
  const post = posts[0]!;

  // The right repository, the right labels, the title as written.
  expect(post.path).toBe('/repos/RyRy79261/noble-notations/issues');
  expect(post.body?.labels).toEqual(['agent-report', 'report:bug']);
  expect(post.body?.title).toBe(
    'get_recipe returns 500 for a slug that exists',
  );
  expect(post.authorizationScheme).toBe('Bearer');

  const sent = post.body?.body ?? '';
  // 1. The tool that was called.
  expect(sent).toContain('### The tool that was called');
  expect(sent).toContain('`get_recipe`');
  // 2. The payload, byte for byte, inside a fence.
  expect(sent).toContain('### What the agent sent');
  expect(sent).toContain('{"slug":"dan-dan-noodles"}');
  // 3. The response, byte for byte.
  expect(sent).toContain('### What came back');
  expect(sent).toContain(
    'An internal error occurred while processing your request.',
  );
  // 4. The commit — supplied by the server, not by the agent, because the
  //    report that created this tool named the wrong one.
  expect(sent).toContain(`| Commit | \`${E2E_COMMIT}\` |`);
  expect(sent).toContain(`| Branch | \`${E2E_BRANCH}\` |`);
  expect(filed.commit).toBe(E2E_COMMIT);

  // And an absent fact is written down as absent rather than omitted. A
  // missing row would silently return the report to being a memory.
  expect(sent).toContain(
    '| Environment | VERCEL_ENV was not set on this deployment |',
  );

  // The fingerprint marker the dedup matches on, and the address the agent
  // is given, both built from the hardcoded repository.
  expect(sent).toContain(`fingerprint=${filed.fingerprint}`);
  expect(filed.url).toBe(
    `https://github.com/RyRy79261/noble-notations/issues/${filed.issueNumber}`,
  );
  expect(filed.message).toContain(`Filed as issue ${filed.issueNumber}.`);
});

test('the dedup reads the issues list, not the search index', async () => {
  await agent().call<Outcome>('report_issue', bugReport());
  const list = (await stubRequests()).filter((r) => r.method === 'GET');
  expect(list).toHaveLength(1);
  // `/search/issues` lags a write by seconds to minutes, which is exactly
  // the retry loop the dedup exists to catch.
  expect(list[0]!.path).toBe('/repos/RyRy79261/noble-notations/issues');
  expect(list[0]!.query.labels).toBe('agent-report');
  expect(list[0]!.query.state).toBe('all');
  expect(list[0]!.query.per_page).toBe('100');
});

// ─────────────────────────────────────────────────────────────────────────
// 2. The repository cannot be named by the caller
// ─────────────────────────────────────────────────────────────────────────

test('the repository is not a parameter, in any spelling', async () => {
  const result = await agent().call<Outcome>('report_issue', {
    ...bugReport({ title: 'search_recipes ignores excludeIngredients' }),
    // Every spelling an agent might reach for. `z.object` strips an unknown
    // key, and there is no field to strip it into, so none of these can
    // reach a URL. The token would refuse a foreign repository too, but the
    // refusal is the wrong place for the control: an agent must not be able
    // to name a target at all.
    repo: 'attacker/loot',
    owner: 'attacker',
    repository: 'attacker/loot',
    repoUrl: 'https://github.com/attacker/loot',
    full_name: 'attacker/loot',
    url: 'https://api.github.com/repos/attacker/loot/issues',
    baseUrl: 'https://api.github.com',
    commit: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
  });
  expect(result.status).toBe('filed');

  const all = await stubRequests();
  expect(all.length).toBeGreaterThan(0);
  for (const request of all) {
    expect(request.path.startsWith('/repos/RyRy79261/noble-notations')).toBe(
      true,
    );
  }

  // And not one of those words reaches the bytes that were about to leave.
  const post = (await created())[0]!;
  for (const word of ['attacker', 'loot', 'api.github.com', 'deadbeef']) {
    expect(post.rawBody).not.toContain(word);
  }

  // The commit in the issue is the server's, not the one the caller sent.
  expect(post.body?.body).toContain(`| Commit | \`${E2E_COMMIT}\` |`);
  expect((result as Filed).commit).toBe(E2E_COMMIT);
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Dedup
// ─────────────────────────────────────────────────────────────────────────

test('the same fault twice comments on the open issue and files nothing new', async () => {
  const mcp = agent();
  const first = (await mcp.call<Outcome>(
    'report_issue',
    bugReport({ title: 'list_ingredients times out over 500 rows' }),
  )) as Filed;
  expect(first.status).toBe('filed');

  const second = (await mcp.call<Outcome>(
    'report_issue',
    bugReport({
      title: 'list_ingredients times out over 500 rows',
      // The second occurrence carries its own evidence, and that difference
      // is what separates "still broken" from "a different bug with the
      // same title". The comment must carry it too.
      response: 'The second time it answered 504 after 30 seconds.',
    }),
  )) as Commented;

  expect(second.status).toBe('commented');
  expect(second.issueNumber).toBe(first.issueNumber);
  expect(second.message).toContain(`matches issue ${first.issueNumber}`);
  expect(second.message).toContain(`Issue ${first.issueNumber} is open`);
  expect(second.url).toBe(
    `https://github.com/RyRy79261/noble-notations/issues/${first.issueNumber}`,
  );
  expect(second.commentUrl).toContain('#issuecomment-');

  expect(await created()).toHaveLength(1);
  const comments = await commented();
  expect(comments).toHaveLength(1);
  expect(comments[0]!.path).toBe(
    `/repos/RyRy79261/noble-notations/issues/${first.issueNumber}/comments`,
  );
  expect(comments[0]!.body?.body).toContain(
    'The second time it answered 504 after 30 seconds.',
  );
  expect(comments[0]!.body?.body).toContain(
    '**Another agent hit this, through the MCP connector.**',
  );
});

test('a retry that changes the punctuation still deduplicates', async () => {
  const mcp = agent();
  const first = (await mcp.call<Outcome>(
    'report_issue',
    bugReport({ title: 'get_recipe returns 500 for slug `laab`' }),
  )) as Filed;

  // The same sentence, retyped: different case, a full stop, no backticks.
  // That IS the retry loop, and normalising over punctuation and case is
  // the whole of what the fingerprint does.
  const second = (await mcp.call<Outcome>(
    'report_issue',
    bugReport({ title: 'Get_recipe returns 500 for slug laab.' }),
  )) as Commented;

  expect(second.status).toBe('commented');
  expect(second.issueNumber).toBe(first.issueNumber);
  expect(await created()).toHaveLength(1);
  expect(await commented()).toHaveLength(1);
});

test('a different fault with a different sentence files its own issue', async () => {
  const mcp = agent();
  await mcp.call<Outcome>(
    'report_issue',
    bugReport({ title: 'add_note refuses a source that has only a title' }),
  );
  await mcp.call<Outcome>(
    'report_issue',
    bugReport({ title: 'upsert_category loses the parent on a second call' }),
  );
  // A wrong merge is worse than a duplicate: the duplicate is visible and
  // the merge is not.
  expect(await created()).toHaveLength(2);
  expect(await commented()).toHaveLength(0);
});

test('a closed match files a new issue that names the old one, and never reopens', async () => {
  const mcp = agent();
  const first = (await mcp.call<Outcome>(
    'report_issue',
    bugReport({ title: 'build_shopping_list sums cloves and heads' }),
  )) as Filed;

  // Put the store into the state where that same fault is already filed and
  // already closed.
  const original = (await created())[0]!;
  await programStub({
    issues: [
      {
        number: 42,
        state: 'closed',
        title: original.body?.title ?? '',
        body: original.body?.body ?? '',
        labels: original.body?.labels ?? [],
      } as StubIssue,
    ],
  });

  const second = (await mcp.call<Outcome>(
    'report_issue',
    bugReport({ title: 'build_shopping_list sums cloves and heads' }),
  )) as Filed;

  expect(second.status).toBe('filed');
  expect(second.previousIssueNumber).toBe(42);
  expect(second.issueNumber).not.toBe(first.issueNumber);
  expect(second.message).toContain('Issue 42 is closed');
  expect(second.message).toContain('did not open it again');

  const posts = await created();
  expect(posts).toHaveLength(2);
  // The one bare `#n` in the whole body that is deliberately not wrapped:
  // the server wrote it, so the cross-reference is intended.
  expect(posts[1]!.body?.body).toContain('#42');

  // Reopening on an agent's word would merge two occurrences into one
  // thread and destroy the evidence that the fault came back after a fix.
  const requests = await stubRequests();
  expect(requests.some((r) => r.method === 'PATCH')).toBe(false);
  expect(await commented()).toHaveLength(0);
});

test('a pull request carrying the same fingerprint is not mistaken for the issue', async () => {
  const mcp = agent();
  await mcp.call<Outcome>(
    'report_issue',
    bugReport({ title: 'revise_recipe drops a step with no duration' }),
  );

  // GET /repos/{owner}/{repo}/issues returns pull requests as well as
  // issues. It is the classic mistake with this endpoint, and a comment
  // posted onto a PR is a report nobody reads.
  const original = (await created())[0]!;
  await programStub({
    issues: [
      {
        number: 55,
        state: 'open',
        title: original.body?.title ?? '',
        body: original.body?.body ?? '',
        labels: original.body?.labels ?? [],
        pull_request: { url: 'https://api.github.invalid/pulls/55' },
      } as StubIssue,
    ],
  });

  const second = (await mcp.call<Outcome>(
    'report_issue',
    bugReport({ title: 'revise_recipe drops a step with no duration' }),
  )) as Filed;

  expect(second.status).toBe('filed');
  expect(await created()).toHaveLength(2);
  expect(await commented()).toHaveLength(0);
});

// ─────────────────────────────────────────────────────────────────────────
// 4. A failed search must never lose the report
// ─────────────────────────────────────────────────────────────────────────

test('a failed duplicate check files the report anyway, and says so twice', async () => {
  // The degraded principal, not the read/write one. `submitReport` keeps a
  // per-process burst counter keyed by user id and consults it only on this
  // path, and every healthy filing in this file increments the read/write
  // principal's count. Sharing the principal would cap this test on work
  // that has nothing to do with it.
  const mcp = agent(tokens().degraded);
  await programStub({ listStatus: 500 });

  const result = (await mcp.call<Outcome>(
    'report_issue',
    bugReport({ title: 'get_experiment returns the wrong revision number' }),
  )) as Filed;

  // A lost report costs the entire reason this tool exists: the evidence is
  // in the agent's context right now and is gone the moment its turn ends.
  // A duplicate costs a maintainer one click.
  expect(result.status).toBe('filed');
  expect(result.duplicateCheckRan).toBe(false);
  expect(await created()).toHaveLength(1);

  // Said to the caller…
  expect(result.message).toContain('could not check for a duplicate');
  // …and written into the issue, so a maintainer reading two identical
  // reports knows why there are two.
  expect((await created())[0]!.body?.body).toContain(
    'could not read the existing reports',
  );
});

// ─────────────────────────────────────────────────────────────────────────
// 5. The cap
// ─────────────────────────────────────────────────────────────────────────

test('at ten open reports the tool refuses, files nothing, and says why', async () => {
  const openReports: StubIssue[] = Array.from({ length: 10 }, (_, i) => ({
    number: 200 + i,
    state: 'open' as const,
    title: `an agent report that is already open (${i})`,
    body: `<!-- noble-notations:agent-report v1 fingerprint=cafe0000000${i} -->`,
    labels: ['agent-report', 'report:bug'],
  }));
  await programStub({ issues: openReports });

  const result = (await agent().call<Outcome>(
    'report_issue',
    bugReport({
      title: 'log_experiment accepts a revision that does not exist',
    }),
  )) as Capped;

  expect(result.status).toBe('capped');
  expect(result.openReports).toBe(10);
  expect(result.limit).toBe(10);

  // Nothing was filed and nothing was commented on. This is the cap the
  // dedup cannot be: a hundred differently titled reports.
  expect(await created()).toHaveLength(0);
  expect(await commented()).toHaveLength(0);

  expect(result.message).toContain('did not file this report');
  // The count and the limit are two numbers. Open reports can pass ten — a
  // person can apply the label by hand, and the degraded path files past it
  // — and printing the count as the limit told the agent a made-up fact in
  // the one tool whose whole purpose is not making facts up.
  expect(result.message).toContain('has 10 open reports');
  expect(result.message).toContain('The limit is 10');
  expect(result.message).toContain('label%3Aagent-report');
  // The load-bearing sentence: the agent still holds the evidence, and
  // telling the human is the fallback that keeps it from being lost.
  expect(result.message).toContain('Tell the person you work with');
  expect(result.message).toContain('Do not call report_issue again');
});

test('the cap is a success, not an error, so a model does not retry into it', async () => {
  await programStub({
    issues: Array.from({ length: 12 }, (_, i) => ({
      number: 300 + i,
      state: 'open' as const,
      title: `open report ${i}`,
      body: `<!-- noble-notations:agent-report v1 fingerprint=beef0000000${i} -->`,
      labels: ['agent-report'],
    })),
  });
  // `isError: true` makes a model treat a call as failed and reach for a
  // retry, which is the exact behaviour the cap exists to stop. `call()`
  // throws on `isError`, so resolving is the assertion.
  const result = (await agent().call<Outcome>(
    'report_issue',
    bugReport({ title: 'get_repository_stats counts revisions twice' }),
  )) as Capped;
  expect(result.status).toBe('capped');
});

test('an open match beats the open-report cap, and then meets its own', async () => {
  // Two properties in one place, because they are the same decision read
  // twice. Commenting files no issue, so the open-report cap does not apply
  // to it — and a write that no cap applies to is not safe merely because it
  // is not an issue. Twenty identical calls used to produce one issue and
  // nineteen comments, each carrying the whole evidence block into a public
  // thread, and every one of them answered `ok()`: a model reads that as
  // permission to go again. The dedup stops the second ISSUE. This stops the
  // fourth WRITE.
  const mcp = agent();
  const title = 'add_mass_flow rejects a value it documents';
  const first = (await mcp.call<Outcome>(
    'report_issue',
    bugReport({ title }),
  )) as Filed;

  const original = (await created())[0]!;
  await programStub({
    issues: [
      {
        number: first.issueNumber,
        state: 'open' as const,
        title: original.body?.title ?? '',
        body: original.body?.body ?? '',
        labels: original.body?.labels ?? [],
      },
      ...Array.from({ length: 11 }, (_, i) => ({
        number: 400 + i,
        state: 'open' as const,
        title: `open report ${i}`,
        body: `<!-- noble-notations:agent-report v1 fingerprint=feed0000000${i} -->`,
        labels: ['agent-report'],
      })),
    ],
  });

  // Twelve open reports, well over the cap of ten, and the comment still
  // lands: the evidence of a fault that is already known belongs on its
  // issue, and adding it files nothing.
  const second = (await mcp.call<Outcome>(
    'report_issue',
    bugReport({ title }),
  )) as Commented;
  expect(second.status).toBe('commented');
  expect(await commented()).toHaveLength(1);

  // The second and third occurrences may still differ — a different commit,
  // a different payload — so they are taken.
  for (const attempt of [2, 3]) {
    const next = (await mcp.call<Outcome>(
      'report_issue',
      bugReport({ title, response: `occurrence ${attempt} answered 504` }),
    )) as Commented;
    expect(next.status).toBe('commented');
  }
  expect(await commented()).toHaveLength(3);

  // The fourth is the retry loop, and it is refused. Not an error result:
  // `isError` invites the retry this exists to stop, so `call()` resolving
  // is itself part of the assertion.
  const fourth = (await mcp.call<Outcome>(
    'report_issue',
    bugReport({ title, response: 'occurrence 4 answered 504' }),
  )) as Capped;
  expect(fourth.status).toBe('capped');
  expect(fourth.reason).toBe('comments');
  expect(fourth.limit).toBe(3);
  expect(fourth.url).toBe(
    `https://github.com/RyRy79261/noble-notations/issues/${first.issueNumber}`,
  );
  expect(fourth.message).toContain(`issue ${first.issueNumber} already`);
  expect(fourth.message).toContain('Stop.');

  // And nothing left the process: no fourth comment, and still one issue.
  expect(await commented()).toHaveLength(3);
  expect(await created()).toHaveLength(1);
});

// ─────────────────────────────────────────────────────────────────────────
// 6. Neutralisation — the exact bytes
// ─────────────────────────────────────────────────────────────────────────

test('a mention, a closing keyword and a cross-reference cannot act on GitHub', async () => {
  const result = await agent().call<Outcome>('report_issue', {
    title: 'the guide tells an agent to notify a person',
    body:
      'The guide says to ping @ryanjnoble and to write "fixes #9" in the ' +
      'report. It names GH-12 and ' +
      'https://github.com/RyRy79261/noble-notations/issues/3 and ' +
      'RyRy79261/noble-notations#7 as well.',
    kind: 'unclear-docs',
  });
  expect(result.status).toBe('filed');

  const post = (await created())[0]!;
  const sent = post.body?.body ?? '';
  expect(post.body?.labels).toEqual(['agent-report', 'report:unclear-docs']);

  // GitHub does not autolink and does not notify inside a code span. Each
  // construct must be wrapped, and must appear nowhere unwrapped.
  for (const construct of [
    '@ryanjnoble',
    '#9',
    'GH-12',
    'https://github.com/RyRy79261/noble-notations/issues/3',
    'RyRy79261/noble-notations#7',
  ]) {
    expect(sent).toContain(`\`${construct}\``);
    // Assert on the exact bytes that were about to leave, not on the parsed
    // field: an unwrapped occurrence anywhere in the JSON on the wire is an
    // unwrapped occurrence in the issue.
    const bare = construct.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expect(post.rawBody).not.toMatch(new RegExp(`[^\`\\\\]${bare}`));
  }

  // The closing keyword is left inert beside the neutralised reference. It
  // is not the dangerous half — a keyword in an issue body closes nothing —
  // and a blocklist would be incomplete and would mangle honest prose.
  expect(sent).toContain('fixes `#9`');

  // A report with no tool call carries no evidence sections. An empty
  // heading reads as missing data rather than as a kind that has none.
  expect(sent).not.toContain('### The tool that was called');
  expect(sent).not.toContain('### What the agent sent');
});

test('one unpaired backtick in the prose cannot set a mention free', async () => {
  // The wrapping works because GitHub does not notify inside a code span,
  // and that holds only while every backtick in the document is one the
  // server inserted. An unclosed inline span — an ordinary thing to write
  // while quoting a field name — used to pair with the backtick inserted in
  // front of the mention, leaving `@ryanjnoble` outside the span and live.
  // The escaping pass is what makes the pairs balanced by construction.
  const body =
    'The error was `foo @ryanjnoble and the guide says `ask @ryanjnoble ' +
    'first` when a tool fails. It told me to write `see #9 for the fix` in ' +
    'the report. Look: ![beacon](https://evil.invalid/pixel.png) and ' +
    '[click](https://evil.invalid/steal) and ' +
    '<img src="https://evil.invalid/p.png"> and ' +
    'www.github.com/RyRy79261/noble-notations/issues/1 as well.';

  await agent().call<Outcome>('report_issue', {
    title: 'the report body can carry an unclosed code span',
    body,
    kind: 'unclear-docs',
  });

  const sent = (await created())[0]!.body?.body ?? '';

  // Every backtick that is still a delimiter is one the server wrote: the
  // agent's are escaped, and CommonMark says an escaped backtick cannot open
  // a code span.
  expect(sent).toContain('\\`foo `@ryanjnoble`');
  expect(sent).toContain('\\`ask `@ryanjnoble` first\\`');
  expect(sent).toContain('\\`see `#9` for the fix\\`');

  // A Markdown image is a beacon and a Markdown link is an attacker-chosen
  // target, both published under "An agent filed this through the MCP
  // connector". GitHub's sanitiser keeps <img> too, so the angle bracket
  // goes the same way. Every one of these is escaped rather than rendered.
  expect(sent).toContain('!\\[beacon\\]');
  expect(sent).toContain('\\[click\\]');
  expect(sent).toContain('\\<img');
  // GFM autolinks a `www.` host with no scheme, so it needs wrapping too.
  expect(sent).toContain('`www.github.com/RyRy79261/noble-notations/issues/1`');

  // And the prose is quoted, so a reader can tell the agent's words from the
  // server's facts. A forged "### The deployment" table cannot pass for the
  // real one when the real one is the only thing outside the quotation.
  expect(sent).toContain('\n> The error was');
  expect(sent).toContain('\n### The deployment\n');
});

test('agent prose cannot claim a fingerprint it does not own', async () => {
  // The dedup decides where evidence lands, and the fingerprint is a public,
  // deterministic hash of the title. A substring test over the whole stored
  // body therefore let one issue swallow every later report of a fault
  // nobody had seen — and an honest report ABOUT the dedup did it by
  // accident, by quoting a marker. Only the marker the server wrote, at the
  // start of the body, may claim a fingerprint.
  const mcp = agent();
  const victim = bugReport({
    title: 'list_categories returns a tag twice for one recipe',
  });
  const first = (await mcp.call<Outcome>('report_issue', victim)) as Filed;
  expect(first.status).toBe('filed');

  // One issue whose PROSE carries the victim's fingerprint, and no marker of
  // its own. Under the old substring test this issue matched, and the report
  // below became a comment on it.
  await programStub({
    issues: [
      {
        number: 77,
        state: 'open',
        title: 'an unrelated report that quotes a marker',
        body:
          '**An agent filed this through the MCP connector.**\n\n> I saw ' +
          `the line fingerprint=${first.fingerprint} in an issue and I do ` +
          'not know what it means.',
        labels: ['agent-report', 'report:unclear-docs'],
      } as StubIssue,
    ],
  });

  const second = (await mcp.call<Outcome>('report_issue', victim)) as Filed;
  expect(second.status).toBe('filed');
  expect(second.issueNumber).not.toBe(77);
  expect(await commented()).toHaveLength(0);
  expect(await created()).toHaveLength(2);

  // The second control: an agent cannot write a marker into a stored body at
  // all, because the escaping pass takes the angle bracket with everything
  // else that carries structure.
  await mcp.call<Outcome>('report_issue', {
    title: 'the dedup marker can be written by an agent',
    body:
      'I saw this: <!-- noble-notations:agent-report v1 ' +
      `fingerprint=${first.fingerprint} --> in a body.`,
    kind: 'unclear-docs',
  });
  const planted = (await created())[2]!.body?.body ?? '';
  expect(planted).toContain('\\<!-- noble-notations:agent-report');
});

test('a title cannot carry a newline or a right-to-left override', async () => {
  await agent().call<Outcome>('report_issue', {
    title: 'search_recipes\n‮ignores the query​ entirely',
    body:
      'I searched for a word that is in three titles. The result was empty. ' +
      'A correct answer names those three recipes.',
    kind: 'bug',
    toolName: 'search_recipes',
    payload: '{"query":"laab"}',
    response: '{"results":[]}',
  });

  const title = (await created())[0]!.body?.title ?? '';
  // Flattened to one line of plain text: no control characters (a title
  // written across two lines must not have its words glued together), and
  // no format characters (the override is what disguises text in a list).
  expect(title).toBe('search_recipes ignores the query entirely');
  expect(title).not.toMatch(/[\p{Cc}\p{Cf}]/u);
});

// ─────────────────────────────────────────────────────────────────────────
// 7. Secrets
// ─────────────────────────────────────────────────────────────────────────

test('a credential in the payload never leaves the process', async () => {
  // The worst case is specific to this system: an agent that pastes its own
  // request pastes a live credential for this very server into a public
  // repository.
  const serverToken = `mcp_at_${'A'.repeat(43)}`;
  const payload =
    `{"headers":{"authorization":"Bearer ${serverToken}"},` +
    `"db":"postgres://noble:hunter2secret@db.example.com:5432/noble"}`;

  const result = (await agent().call<Outcome>(
    'report_issue',
    bugReport({
      title: 'create_recipe answers 401 with a token that works elsewhere',
      payload,
    }),
  )) as Filed;

  const post = (await created())[0]!;
  expect(post.rawBody).not.toContain(serverToken);
  expect(post.rawBody).not.toContain('hunter2secret');
  expect(post.rawBody).toContain('[redacted:');

  // The scheme, the user and the host stay: a report that says "the
  // database refused me" is useless without them.
  const sent = post.body?.body ?? '';
  expect(sent).toContain('postgres://noble:');
  expect(sent).toContain('db.example.com:5432/noble');

  // Redact, file, and say so — refusing on a suspected secret would lose
  // the report, and this count is the only mechanism that tells an agent it
  // just leaked something.
  expect(result.redactions).toBe(2);
  expect(result.message).toContain('removed 2 values');
  expect(result.message).toContain('If a credential is real, change it now.');
  expect(sent).toContain('2 values were removed from the evidence');
});

test('the agent identity and the server credential are not in what is sent', async () => {
  await agent().call<Outcome>(
    'report_issue',
    bugReport({ title: 'get_started omits the note kinds it names' }),
  );
  const post = (await created())[0]!;
  // Only title, body, kind, toolName, response, payload and the
  // server-composed block are allowed out. The identity belongs in
  // mcp_audit_log; the public issue gets the evidence.
  expect(post.rawBody).not.toContain('mcp_client_');
  expect(post.rawBody).not.toContain('mcp_at_');
  expect(post.rawBody).not.toContain('stub-token-not-a-real-credential');
  expect(post.rawBody).not.toContain('postgresql://');
});

test('evidence survives a payload that tries to break out of its fence', async () => {
  const payload = [
    '{"note":"before"}',
    '```',
    'an inner fence',
    '```',
    '~~~',
    'a tilde fence',
    '~~~',
    'after',
  ].join('\n');

  await agent().call<Outcome>(
    'report_issue',
    bugReport({
      title: 'add_note rejects a body that contains a code fence',
      payload,
    }),
  );

  const sent = (await created())[0]!.body?.body ?? '';
  // CommonMark: a fence closes only on a run at least as long as the one
  // that opened it, so the barrier has to be longer than anything inside.
  expect(sent).toContain('````text\n');
  // And the bytes are unchanged.
  expect(sent).toContain(payload);
});

// ─────────────────────────────────────────────────────────────────────────
// 8. The gate — authentication, deliberately not a scope
// ─────────────────────────────────────────────────────────────────────────

test('a read-only token may file a report', async () => {
  // This is the scope decision under test. `report_issue` writes no row and
  // reads none, so `noble-notations:write` does not describe it — and
  // gating on write would fail the use case, because a read-only agent is
  // exactly the one that meets a read tool's bug. A third scope was
  // rejected too: `parseScopeString` drops an unrecognised scope and falls
  // back to read, so every token already minted would lack it.
  const result = await agent(tokens().readOnly).call<Outcome>(
    'report_issue',
    bugReport({ title: 'search_recipes returns a recipe that was superseded' }),
  );
  expect(result.status).toBe('filed');
  expect(await created()).toHaveLength(1);
});

test('the read-only token is still refused a write tool', async () => {
  // The control for the test above. If a read token could write, "a read
  // token may file a report" would prove nothing about scopes.
  await expect(
    agent(tokens().readOnly).call('upsert_category', {
      categoryType: 'technique',
      slug: 'report-issue-scope-check',
      label: 'Report issue scope check',
      description: 'A tag that must never be created by a read-only token.',
    }),
  ).rejects.toThrow(/read-only access/i);
});

test('the setup page names the tool that reaches outside this system', async () => {
  // `/connect` and `docs/mcp-connector.md` name the registry, and a tool
  // that appears without those moving with it is drift — the comment above
  // TOOLS in e2e/mcp-contract.spec.ts is the line that says so. This one
  // matters more than most: it is the only tool that writes anywhere but
  // this database, and the person reading /connect is the person who owns
  // the repository it writes to.
  const response = await fetch(
    `http://127.0.0.1:${process.env.E2E_PORT ?? 3100}/connect`,
  );
  const html = await response.text();
  expect(html).toContain('report_issue');
  expect(html).toContain('GitHub');
});

test('a caller with no token cannot reach report_issue at all', async () => {
  // The gate is authentication: `withMcpAuth` is required, so every caller
  // holds a token the owner approved on a consent screen, and that approval
  // is the permission that matters.
  const response = await fetch(
    `http://127.0.0.1:${process.env.E2E_PORT ?? 3100}/api/mcp/mcp`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'report_issue', arguments: bugReport() },
      }),
    },
  );
  expect(response.status).toBe(401);
  expect(response.headers.get('www-authenticate')).toContain('Bearer');
  expect(await created()).toHaveLength(0);
});

// ─────────────────────────────────────────────────────────────────────────
// 9. Refusals, and what GitHub is never allowed to say
// ─────────────────────────────────────────────────────────────────────────

test('a bug without evidence is refused, and the refusal names all three fields', async () => {
  const call = agent().call('report_issue', {
    title: 'something in the connector is broken',
    body:
      'I remember that a tool did the wrong thing earlier in this session. ' +
      'I no longer have the arguments or the answer.',
    kind: 'bug',
  });
  // The rule JSON Schema cannot express, which is why the shape and the
  // assembled schema are split.
  await expect(call).rejects.toThrow(/toolName/);
  await expect(call).rejects.toThrow(/payload/);
  await expect(call).rejects.toThrow(/response/);
  // And the way out, so a report with no evidence is still filed — under a
  // kind that says plainly it is a memory.
  await expect(call).rejects.toThrow(/missing-capability/);
  expect(await created()).toHaveLength(0);
});

test('the same report without evidence is accepted under a kind that does not claim it', async () => {
  const result = await agent().call<Outcome>('report_issue', {
    title: 'I could not find a tool that deletes a recipe',
    body:
      'I looked through tools/list for a way to remove a recipe and found ' +
      'none. I do not know whether that is deliberate.',
    kind: 'missing-capability',
  });
  expect(result.status).toBe('filed');
  expect((await created())[0]!.body?.labels).toEqual([
    'agent-report',
    'report:missing-capability',
  ]);
});

test('a GitHub failure is an error result that names the status and quotes nothing', async () => {
  await programStub({ createStatus: 403 });
  const call = agent().call(
    'report_issue',
    bugReport({ title: 'describe_mechanism drops the conditions array' }),
  );
  await expect(call).rejects.toThrow(/403/);
  // A fault in the server, so the agent is told not to try again.
  await expect(call).rejects.toThrow(/Do not call report_issue again/);
  // GitHub's own error body carries documentation URLs and internals that
  // mean nothing to a caller. The status is the whole of what travels.
  await expect(call).rejects.not.toThrow(new RegExp(STUB_LEAK_MARKER));
});

test('a GitHub outage tells the agent to try once more', async () => {
  await programStub({ createStatus: 502 });
  const call = agent().call(
    'report_issue',
    bugReport({ title: 'backfill_revision moves the current revision' }),
  );
  await expect(call).rejects.toThrow(/502/);
  // One retry is the right reflex here, and the caller did nothing wrong.
  await expect(call).rejects.toThrow(/one more time/);
});

// ─────────────────────────────────────────────────────────────────────────
// 10. The local record
// ─────────────────────────────────────────────────────────────────────────

test('the audit log records the call and none of its text', async () => {
  const title = 'get_ingredient returns an alias as a separate ingredient';
  const secretish = 'a sentence that must never reach the audit log';
  await agent().call<Outcome>(
    'report_issue',
    bugReport({
      title,
      body: `${secretish}. It happened twice in a row.`,
      toolName: 'get_ingredient',
    }),
  );

  // `writeMcpAudit` is fire-and-forget, so the row lands just after the
  // answer does.
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    let row:
      { args_json: string | null; status: string; user_id: string } | undefined;
    for (let attempt = 0; attempt < 40 && !row; attempt += 1) {
      const result = await client.query<{
        args_json: string | null;
        status: string;
        user_id: string;
      }>(
        `select args_json, status, user_id from mcp_audit_log
         where tool = 'report_issue' order by timestamp desc, id desc limit 1`,
      );
      row = result.rows[0];
      if (!row) await new Promise((resolve) => setTimeout(resolve, 100));
    }

    expect(row, 'no report_issue row reached mcp_audit_log').toBeTruthy();
    expect(row!.status).toBe('success');
    // This row is the only local record that a filing happened at all, and
    // the evidence for "who filed the hundred issues" when the cap is
    // investigated.
    expect(row!.user_id).toBeTruthy();
    // And the rule holds here as everywhere: free-form text is never
    // logged. The kind and the tool name are identifying primitives.
    expect(row!.args_json).toContain('"kind":"bug"');
    expect(row!.args_json).toContain('"toolName":"get_ingredient"');
    expect(row!.args_json).not.toContain(title);
    expect(row!.args_json).not.toContain(secretish);
    expect(row!.args_json).not.toContain('dan-dan-noodles');
  } finally {
    await client.end();
  }
});

// ─────────────────────────────────────────────────────────────────────────
// 11. No credential, no tool
// ─────────────────────────────────────────────────────────────────────────

test('the guide names the tool where the tool exists', async () => {
  // The positive half of the pair below. Here the credential is set, so the
  // server instructions and get_started both teach the tool.
  const guide = await agent().call<Record<string, unknown>>('get_started', {});
  expect(typeof guide.reportingAFault).toBe('string');
  expect(String(guide.reportingAFault)).toContain('report_issue');
  expect(JSON.stringify(guide.workflow)).toContain('report_issue');
  expect(String(guide.scopes)).toContain('report_issue');
  expect(
    await instructionsOf(`http://127.0.0.1:${process.env.E2E_PORT ?? 3100}`),
  ).toContain('report_issue');
});

test('issueReportingConfigured is the predicate registration turns on', () => {
  // `src/lib/github/config.ts` imports nothing — not `server-only`, not an
  // `@/…` alias — precisely so a spec can reach it. `server-only` resolves
  // to its throwing client entry outside the react-server condition, and
  // one import there would fail this file at import time in a way that
  // looks nothing like its cause.
  expect(issueReportingConfigured({})).toBe(false);
  expect(issueReportingConfigured({ GITHUB_ISSUE_TOKEN: '' })).toBe(false);
  expect(issueReportingConfigured({ GITHUB_ISSUE_TOKEN: '   ' })).toBe(false);
  expect(issueReportingConfigured({ GITHUB_ISSUE_TOKEN: 'ghp_x' })).toBe(true);
});

test('without GITHUB_ISSUE_TOKEN the tool is not in tools/list at all', async () => {
  test.setTimeout(180_000);

  // The predicate above proves the decision; this proves the wiring. A
  // second production server, started from the build that is already on
  // disk, with the credential taken out of its environment. A
  // registered-but-broken report_issue would be strictly worse than no
  // tool, because an agent would file into a void and consider the problem
  // reported — so the assertion is absence, not a refusal.
  const port = Number(process.env.E2E_NO_TOKEN_PORT ?? 3102);
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.GITHUB_ISSUE_TOKEN;
  delete env.GITHUB_API_BASE_URL;

  const child = spawn(
    process.execPath,
    [
      path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next'),
      'start',
      '-p',
      String(port),
    ],
    { cwd: process.cwd(), env, stdio: 'pipe', detached: true },
  );

  let output = '';
  child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));

  try {
    const base = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + 120_000;
    let listening = false;
    while (!listening && Date.now() < deadline) {
      try {
        await fetch(`${base}/api/mcp/mcp`, { method: 'GET' });
        listening = true;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    expect(
      listening,
      `the token-free server never answered on ${base}:\n${output}`,
    ).toBe(true);

    const mcp = mcpClient(base, tokens().readWrite);
    const names = await mcp.listTools();
    expect(names).not.toContain('report_issue');
    // The control: this is a real registry, not an empty one.
    expect(names).toContain('get_recipe');
    expect(names).toContain('get_started');

    // AND THE GUIDE MOVES WITH THE REGISTRY. Instructions and a guide that
    // tell an agent to call a tool `tools/list` does not carry send it to a
    // tool-not-found error at the moment it most needs to be believed — the
    // same "told a capability exists, found it absent" failure this whole
    // branch exists to reduce, and it cannot report that one either.
    const guide = await mcp.call<Record<string, unknown>>('get_started', {});
    expect(guide.reportingAFault).toBeUndefined();
    expect(JSON.stringify(guide)).not.toContain('report_issue');
    // The control again: the rest of the guide is still there.
    expect(String(guide.theOneRule)).toContain('revise_recipe');
    expect(await instructionsOf(base)).not.toContain('report_issue');
  } finally {
    // By PID, and by process group so the child cannot be orphaned. Never
    // `pkill` — that takes a sibling agent's server down with it.
    if (child.pid) {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        try {
          process.kill(child.pid, 'SIGTERM');
        } catch {
          /* already gone */
        }
      }
    }
  }
});
