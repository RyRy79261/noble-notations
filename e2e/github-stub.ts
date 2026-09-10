/**
 * A GitHub that is not GitHub.
 *
 * `report_issue` is the one tool whose effect lands outside this system, and
 * an issue filed by accident is a real issue in a real repository that a
 * person then has to close. So the suite must never reach api.github.com —
 * not in a test, not in a probe, not once.
 *
 * That guarantee is a property of the network layer, not of discipline.
 * `src/lib/github/client.ts` reads `GITHUB_API_BASE_URL`, and
 * `playwright.config.ts` points it at this process. Every request the server
 * would have sent to GitHub arrives here instead, and is recorded verbatim,
 * so a test can assert on the exact bytes that were about to leave.
 *
 * Run as a Playwright `webServer` entry rather than from `globalSetup`:
 * `e2e/global-setup.ts` says in its own comment that this repository does
 * not depend on Playwright's ordering of the two, and a `webServer` entry
 * makes Playwright guarantee the stub is up before any test and torn down
 * after, with no lifecycle code of ours.
 *
 * Endpoints, in two groups.
 *
 *   The GitHub half — only ever the hardcoded repository:
 *     GET  /repos/RyRy79261/noble-notations/issues
 *     POST /repos/RyRy79261/noble-notations/issues
 *     POST /repos/RyRy79261/noble-notations/issues/:n/comments
 *
 *   The control half, all prefixed `__` so they can never collide with a
 *   real GitHub path and are never recorded as traffic:
 *     GET  /__health     readiness, for Playwright's probe
 *     POST /__reset      clear the recording and the programmed state
 *     POST /__state      program the next answers
 *     GET  /__requests   every request that arrived, in order
 *     GET  /__issues     what the stub is currently holding
 *
 * ANY other path is recorded and then answered 404. That is deliberate: a
 * test proves the caller cannot name the repository by asserting on what
 * arrived, so a request aimed somewhere else has to be visible rather than
 * swallowed by the router.
 *
 * A created issue is stored and comes back in the list. The dedup is then
 * exercised against what the server itself wrote, end to end, rather than
 * against a fixture a test invented.
 */
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  STUB_DEFAULT_PORT,
  STUB_ISSUES_PATH,
  STUB_LEAK_MARKER,
  type StubIssue,
  type StubRequest,
  type StubState,
} from './github-stub-contract';

function defaults(): StubState {
  return {
    issues: [],
    listStatus: 200,
    createStatus: 201,
    commentStatus: 201,
    nextIssueNumber: 101,
  };
}

let state = defaults();
let requests: StubRequest[] = [];

function htmlUrl(issueNumber: number): string {
  return `https://github.com/RyRy79261/noble-notations/issues/${issueNumber}`;
}

function serialise(issue: StubIssue): Record<string, unknown> {
  return {
    number: issue.number,
    state: issue.state,
    title: issue.title,
    body: issue.body,
    html_url: htmlUrl(issue.number),
    closed_at: issue.state === 'closed' ? '2026-01-01T00:00:00Z' : null,
    labels: issue.labels.map((name) => ({ name })),
    ...(issue.pull_request ? { pull_request: issue.pull_request } : {}),
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, payload: unknown): void {
  const text = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(text),
  });
  res.end(text);
}

/**
 * A programmed failure answers the way GitHub does: a message and a
 * documentation URL. Both carry the leak marker, so a test can prove the
 * tool composed its refusal from the status code and passed none of this on.
 */
function sendFailure(res: ServerResponse, status: number): void {
  send(res, status, {
    message: `Programmed failure ${status} — ${STUB_LEAK_MARKER}`,
    documentation_url: `https://example.invalid/${STUB_LEAK_MARKER}`,
  });
}

function asIssue(raw: unknown, fallbackNumber: number): StubIssue {
  const value = (raw ?? {}) as Partial<StubIssue>;
  return {
    number: typeof value.number === 'number' ? value.number : fallbackNumber,
    state: value.state === 'closed' ? 'closed' : 'open',
    title: typeof value.title === 'string' ? value.title : 'programmed issue',
    body: typeof value.body === 'string' ? value.body : null,
    labels: Array.isArray(value.labels) ? value.labels : ['agent-report'],
    ...(value.pull_request ? { pull_request: value.pull_request } : {}),
  };
}

/** Returns true when the path was a control endpoint and is now answered. */
function handleControl(
  res: ServerResponse,
  method: string,
  path: string,
  body: unknown,
): boolean {
  if (path === '/__health' && method === 'GET') {
    send(res, 200, { ok: true });
    return true;
  }

  if (path === '/__reset' && method === 'POST') {
    state = defaults();
    requests = [];
    send(res, 200, { ok: true });
    return true;
  }

  if (path === '/__state' && method === 'POST') {
    const next = (body ?? {}) as Partial<StubState>;
    if (Array.isArray(next.issues)) {
      // Replaces rather than appends, so a test can put the store into an
      // exact shape after the server has already written to it.
      state.issues = next.issues.map((issue, index) =>
        asIssue(issue, 1000 + index),
      );
    }
    for (const key of [
      'listStatus',
      'createStatus',
      'commentStatus',
      'nextIssueNumber',
    ] as const) {
      const value = next[key];
      if (typeof value === 'number') state[key] = value;
    }
    send(res, 200, { ok: true });
    return true;
  }

  if (path === '/__requests' && method === 'GET') {
    send(res, 200, { requests });
    return true;
  }

  if (path === '/__issues' && method === 'GET') {
    send(res, 200, { issues: state.issues });
    return true;
  }

  return false;
}

const COMMENTS_PATH = new RegExp(
  `^${STUB_ISSUES_PATH.replace(/\//g, '\\/')}\\/(\\d+)\\/comments$`,
);

function handleGitHub(
  res: ServerResponse,
  method: string,
  path: string,
  query: Record<string, string>,
  body: unknown,
): void {
  if (path === STUB_ISSUES_PATH && method === 'GET') {
    if (state.listStatus !== 200) return sendFailure(res, state.listStatus);
    const wanted = (query.labels ?? '').split(',').filter(Boolean);
    const matching = state.issues.filter((issue) =>
      wanted.every((label) => issue.labels.includes(label)),
    );
    return send(res, 200, matching.map(serialise));
  }

  if (path === STUB_ISSUES_PATH && method === 'POST') {
    if (state.createStatus >= 300) return sendFailure(res, state.createStatus);
    const input = (body ?? {}) as {
      title?: string;
      body?: string;
      labels?: string[];
    };
    const issue: StubIssue = {
      number: state.nextIssueNumber,
      state: 'open',
      title: input.title ?? '',
      body: input.body ?? null,
      labels: Array.isArray(input.labels) ? input.labels : [],
    };
    state.nextIssueNumber += 1;
    state.issues.unshift(issue);
    return send(res, 201, serialise(issue));
  }

  const comment = COMMENTS_PATH.exec(path);
  if (comment && method === 'POST') {
    if (state.commentStatus >= 300) {
      return sendFailure(res, state.commentStatus);
    }
    return send(res, 201, {
      html_url: `${htmlUrl(Number(comment[1]))}#issuecomment-900001`,
    });
  }

  send(res, 404, { message: `The stub has no route for ${method} ${path}` });
}

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? '/', 'http://stub.invalid');
    const method = req.method ?? 'GET';
    const rawBody = await readBody(req);
    const query = Object.fromEntries(url.searchParams);

    let parsed: unknown = null;
    try {
      parsed = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      parsed = null;
    }

    if (!url.pathname.startsWith('/__')) {
      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries(req.headers)) {
        // The credential never enters the recording. Its scheme does: "did
        // the client authenticate at all" is worth asserting, the value is
        // not, and a recording that holds a bearer token is the very shape
        // this whole tool exists to keep out of a public place.
        if (name.toLowerCase() === 'authorization') continue;
        headers[name] = Array.isArray(value) ? value.join(', ') : (value ?? '');
      }
      const authorization = req.headers.authorization;
      requests.push({
        method,
        path: url.pathname,
        query,
        rawBody,
        body: parsed as StubRequest['body'],
        headers,
        authorizationScheme:
          typeof authorization === 'string'
            ? (authorization.split(' ')[0] ?? null)
            : null,
      });
    }

    if (handleControl(res, method, url.pathname, parsed)) return;
    handleGitHub(res, method, url.pathname, query, parsed);
  })().catch((error: unknown) => {
    send(res, 500, { message: String(error) });
  });
});

const portFlag = process.argv.indexOf('--port');
const port = Number(
  (portFlag === -1 ? undefined : process.argv[portFlag + 1]) ??
    process.env.E2E_GITHUB_PORT ??
    STUB_DEFAULT_PORT,
);

server.listen(port, '127.0.0.1', () => {
  console.log(`[github-stub] listening on http://127.0.0.1:${port}`);
});
