import 'server-only';

/**
 * The HTTP seam.
 *
 * This module knows URLs, headers and status codes. It knows nothing about
 * reports, fingerprints or caps. `report.ts` holds the policy and takes a
 * `GitHubIssuesClient`, so the policy has no way to reach the network by
 * itself — a fake with three methods is a complete substitute for GitHub.
 *
 * `baseUrl` is the second half of that guarantee, and it is the half the
 * end-to-end suite uses. `GITHUB_API_BASE_URL` points every request at a
 * local stub, so "never call the real GitHub API" is enforced by the network
 * layer rather than by discipline. The e2e environment must also carry a
 * token that is not a real credential: if the base URL were ever
 * misconfigured, GitHub answers 401 and files nothing.
 */
import {
  AGENT_REPORT_LABEL,
  apiBaseUrl,
  DEDUP_WINDOW,
  GITHUB_REPO_FULL,
} from '@/lib/github/config';

/** GitHub did not do what was asked. `status` 0 means it did not answer. */
export class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterSeconds: number | null,
    message: string,
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

export interface IssueSummary {
  number: number;
  state: 'open' | 'closed';
  title: string;
  body: string | null;
  htmlUrl: string;
  closedAt: string | null;
}

export interface CreatedIssue {
  number: number;
  htmlUrl: string;
}

export interface CreatedComment {
  htmlUrl: string;
}

export interface GitHubIssuesClient {
  listAgentReports(): Promise<IssueSummary[]>;
  createIssue(input: {
    title: string;
    body: string;
    labels: string[];
  }): Promise<CreatedIssue>;
  commentOnIssue(issueNumber: number, body: string): Promise<CreatedComment>;
  /** The clock, so a caller can stamp a report deterministically. */
  now(): Date;
}

export interface GitHubIssuesOptions {
  token: string;
  baseUrl?: string;
  fetchImpl?: typeof globalThis.fetch;
  now?: () => Date;
}

const REQUEST_TIMEOUT_MS = 10_000;

interface RawIssue {
  number?: unknown;
  state?: unknown;
  title?: unknown;
  body?: unknown;
  html_url?: unknown;
  closed_at?: unknown;
  pull_request?: unknown;
}

function parseRetryAfter(headers: Headers): number | null {
  const retryAfter = headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number.parseInt(retryAfter, 10);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  }
  const reset = headers.get('x-ratelimit-reset');
  if (reset) {
    const at = Number.parseInt(reset, 10) * 1000;
    if (Number.isFinite(at)) {
      return Math.max(0, Math.ceil((at - Date.now()) / 1000));
    }
  }
  return null;
}

export function createGitHubIssues(
  options: GitHubIssuesOptions,
): GitHubIssuesClient {
  const base = (options.baseUrl?.trim() || apiBaseUrl()).replace(/\/+$/, '');
  const doFetch = options.fetchImpl ?? globalThis.fetch;
  const clock = options.now ?? (() => new Date());
  const issuesPath = `${base}/repos/${GITHUB_REPO_FULL}/issues`;

  async function request(
    url: string,
    init: RequestInit & { method: string },
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await doFetch(url, {
        ...init,
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${options.token}`,
          'content-type': 'application/json',
          'user-agent': 'noble-notations-mcp',
          'x-github-api-version': '2022-11-28',
          ...(init.headers as Record<string, string> | undefined),
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: 'no-store',
      });
    } catch (err) {
      // A network failure, a DNS failure or the timeout above.
      throw new GitHubApiError(
        0,
        null,
        `GitHub did not answer: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!response.ok) {
      // GitHub's own error body carries documentation URLs and rate-limit
      // detail that mean nothing to a caller, so it is read for nothing and
      // never passed on. The status is the whole of what travels.
      throw new GitHubApiError(
        response.status,
        parseRetryAfter(response.headers),
        `GitHub answered ${response.status} for ${init.method} ${new URL(url).pathname}`,
      );
    }

    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  function toSummary(raw: RawIssue): IssueSummary | null {
    if (typeof raw.number !== 'number') return null;
    return {
      number: raw.number,
      state: raw.state === 'closed' ? 'closed' : 'open',
      title: typeof raw.title === 'string' ? raw.title : '',
      body: typeof raw.body === 'string' ? raw.body : null,
      htmlUrl: typeof raw.html_url === 'string' ? raw.html_url : '',
      closedAt: typeof raw.closed_at === 'string' ? raw.closed_at : null,
    };
  }

  return {
    now: clock,

    /**
     * One request answers both the dedup and the cap.
     *
     * Not `/search/issues`: that index is eventually consistent and lags a
     * write by seconds to minutes, which is exactly the retry loop this
     * dedup exists to catch. The issues list endpoint reads the repository
     * directly. It also returns full issue objects including `body`, so a
     * fingerprint is matched from this one response with no follow-up
     * request per candidate.
     */
    async listAgentReports(): Promise<IssueSummary[]> {
      const url =
        `${issuesPath}?labels=${encodeURIComponent(AGENT_REPORT_LABEL)}` +
        `&state=all&sort=updated&direction=desc&per_page=${DEDUP_WINDOW}`;
      const payload = await request(url, { method: 'GET' });
      if (!Array.isArray(payload)) return [];
      return (
        payload
          .filter(
            (item): item is RawIssue =>
              typeof item === 'object' && item !== null,
          )
          // GET /repos/{owner}/{repo}/issues returns pull requests as well as
          // issues. This is the classic mistake with this endpoint; the label
          // filter makes a PR unlikely, not impossible.
          .filter((item) => item.pull_request === undefined)
          .map(toSummary)
          .filter((item): item is IssueSummary => item !== null)
      );
    },

    async createIssue(input): Promise<CreatedIssue> {
      const payload = (await request(issuesPath, {
        method: 'POST',
        body: JSON.stringify({
          title: input.title,
          body: input.body,
          labels: input.labels,
        }),
      })) as RawIssue | null;
      if (typeof payload?.number !== 'number') {
        // A 2xx whose body is not an issue — a proxy or a gateway answering
        // 200 with HTML — used to become "Filed as issue 0" and an address
        // ending in /issues/0. A confident success over a failed filing is
        // the one outcome this tool must never produce: the agent goes on
        // believing the evidence was received. 502 puts it on the retryable
        // side, which is right, because a gateway is usually what did it.
        throw new GitHubApiError(
          502,
          null,
          'GitHub answered POST /issues with no issue number',
        );
      }
      return {
        number: payload.number,
        htmlUrl: typeof payload.html_url === 'string' ? payload.html_url : '',
      };
    },

    async commentOnIssue(issueNumber, body): Promise<CreatedComment> {
      const payload = (await request(`${issuesPath}/${issueNumber}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      })) as { html_url?: unknown } | null;
      return {
        htmlUrl: typeof payload?.html_url === 'string' ? payload.html_url : '',
      };
    },
  };
}
