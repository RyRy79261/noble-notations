/**
 * The shape the fake GitHub and the tests that read it agree on.
 *
 * Kept in a file of its own, with no side effects, so `e2e/github-stub.ts`
 * can start a server at import time and a spec can still share these
 * constants without starting a second one. Duplicating them instead would
 * put the assertion and the thing asserted on two different pieces of paper.
 */

export const STUB_DEFAULT_PORT = 3101;

/**
 * The one repository. Every request the server makes must land under this
 * path — that is the assertion, not a routing convenience, so the stub
 * answers 404 elsewhere rather than refusing to record it.
 */
export const STUB_REPO_PATH = '/repos/RyRy79261/noble-notations';
export const STUB_ISSUES_PATH = `${STUB_REPO_PATH}/issues`;

/**
 * A sentence no real GitHub error carries, planted in every programmed
 * failure body. `report.ts` composes a refusal from the status code alone,
 * so this string must never reach an agent — a test asserts exactly that.
 */
export const STUB_LEAK_MARKER = 'stub-github-internal-detail-do-not-forward';

export interface StubIssue {
  number: number;
  state: 'open' | 'closed';
  title: string;
  body: string | null;
  labels: string[];
  /** Present makes this element a pull request, which the list must drop. */
  pull_request?: Record<string, unknown>;
}

/** One request as it arrived, with the credential taken out of it. */
export interface StubRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  /** The bytes, before any parsing. A leak assertion reads this. */
  rawBody: string;
  body: {
    title?: string;
    body?: string;
    labels?: string[];
  } | null;
  headers: Record<string, string>;
  authorizationScheme: string | null;
}

export interface StubState {
  issues: StubIssue[];
  listStatus: number;
  createStatus: number;
  commentStatus: number;
  nextIssueNumber: number;
  /**
   * How long to hold each issues-list answer open, in milliseconds, one
   * entry per request in arrival order. An empty queue answers at once.
   *
   * It exists for one property that cannot be observed any other way: the
   * open-report cap reads a list and then decides, and what it must not do
   * is hand out a slot that another caller took while that read was in the
   * air. A real GitHub produces that window by being slow, which is the one
   * thing a test cannot ask of it.
   *
   * THE ANSWER IS BUILT WHEN THE REQUEST ARRIVES AND SENT WHEN THE DELAY IS
   * OVER. That is the whole point: the caller gets a snapshot of the issues
   * as they were before the wait, which is exactly what a slow read returns
   * in life. Building it at send time would make the delay invisible.
   */
  listDelaysMs: number[];
}
