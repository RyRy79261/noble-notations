/**
 * Where an agent report goes, and whether it can go at all.
 *
 * THIS MODULE IMPORTS NOTHING. Not `server-only`, not an `@/…` alias, not a
 * sibling in this directory. Two things depend on that:
 *
 *   1. A Playwright spec can import `issueReportingConfigured` by relative
 *      path. `server-only` resolves to its throwing client entry outside the
 *      react-server condition, so one import here would fail a spec at import
 *      time, and the failure would look nothing like its cause.
 *   2. A route can ask whether reporting is on without pulling a token, a
 *      fetch or the GitHub client into its module graph.
 *
 * Do not add an import to this file.
 */

/**
 * The repository is hardcoded, and it is not configurable.
 *
 * `GITHUB_ISSUE_TOKEN` is a fine-grained token with Issues read and write on
 * this one repository. A repo argument — or an env override of the owner or
 * the name — would let a caller aim the server's credential somewhere else.
 * The token itself would refuse, but the refusal is the wrong place for the
 * control: an agent must not be able to name a target at all. So there is no
 * `repo` field in the tool's schema, no `GITHUB_REPO` variable, and one
 * constant that every URL in this directory is built from.
 */
export const GITHUB_OWNER = 'RyRy79261';
export const GITHUB_REPO = 'noble-notations';
export const GITHUB_REPO_FULL = `${GITHUB_OWNER}/${GITHUB_REPO}`;

/** Every agent report carries this. The cap counts it and the dedup filters on it. */
export const AGENT_REPORT_LABEL = 'agent-report';

/** The marker version. A future format change is detectable, not silently unmatched. */
export const REPORT_MARKER_VERSION = 'v1';

/**
 * The cap on open agent reports. Ten.
 *
 * The incident that created this tool produced six distinct real problems in
 * one session. A limit under six punishes the honest case. Ten leaves room
 * for six plus four and is still small enough that a person notices the
 * backlog. It counts OPEN issues, so closing the backlog restores capacity.
 */
export const OPEN_REPORT_CAP = 10;

/**
 * The dedup window: one page of the issues list, sorted by `updated`.
 *
 * Beyond 100 lifetime agent reports, a duplicate of a very old, untouched
 * issue escapes the window and files again. That is accepted. The case this
 * dedup exists for is the retry loop that files twice in four seconds, and
 * that one is always inside the window. The escaped case costs one manual
 * close.
 */
export const DEDUP_WINDOW = 100;

type Env = Record<string, string | undefined>;

/**
 * Read the credential inside a function, never as a module-scope constant.
 * Next.js replaces some `process.env.FOO` reads at build time, and a
 * module-scope constant would freeze the build-time value into a route that
 * is `force-dynamic` precisely so it can read the environment per request.
 */
export function issueToken(env: Env = process.env): string | null {
  const token = env.GITHUB_ISSUE_TOKEN?.trim();
  return token ? token : null;
}

/**
 * Whether `report_issue` may be registered at all.
 *
 * The repository's rule is to degrade to an explanatory absence, never to a
 * stack trace. For a tool, the equivalent of a notice is not existing: a tool
 * the model cannot see cannot be called, cannot fail confusingly, and cannot
 * make an agent believe its report was received. A registered-but-broken
 * `report_issue` is strictly worse than no tool at all.
 */
export function issueReportingConfigured(env: Env = process.env): boolean {
  return issueToken(env) !== null;
}

const GITHUB_API = 'https://api.github.com';

/** The only hosts the override may name. */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/**
 * The API origin. `GITHUB_API_BASE_URL` exists so the end-to-end suite can
 * point every request at a local stub, which is what makes "never call the
 * real GitHub API" a property of the network layer rather than of
 * discipline. It never names a repository.
 *
 * IT IS HONOURED FOR A LOOPBACK HOST ONLY. The variable is a test seam, and
 * a test seam that is live in production is a way to send this deployment's
 * credential — as `Authorization: Bearer …` — to whatever host it names. A
 * stale value in a Vercel project's environment is enough, and previews
 * inherit project environment variables. Restricting the host rather than
 * the environment is deliberate: `next start` runs with NODE_ENV set to
 * production, so the end-to-end suite would lose its stub under an
 * environment test, and losing the stub means calling the real GitHub.
 */
export function apiBaseUrl(env: Env = process.env): string {
  const base = env.GITHUB_API_BASE_URL?.trim();
  if (!base) return GITHUB_API;
  let host: string;
  try {
    host = new URL(base).hostname;
  } catch {
    return GITHUB_API;
  }
  if (!LOOPBACK_HOSTS.has(host)) return GITHUB_API;
  return base.replace(/\/+$/, '');
}

export interface DeploymentFacts {
  commit: string | null;
  branch: string | null;
  environment: string | null;
}

/**
 * The one field a memory cannot corrupt.
 *
 * The report that created this tool named the wrong commit, so the commit is
 * not an input. `VERCEL_GIT_COMMIT_SHA`, `VERCEL_GIT_COMMIT_REF` and
 * `VERCEL_ENV` are the spellings Next.js 16.3.3 itself reads
 * (`node_modules/next/dist/esm/lib/helpers/git.js` and
 * `.../metadata/resolvers/resolve-url.js`). `VERCEL_DEPLOYMENT_ID` is not
 * read here because its spelling could not be confirmed from this checkout.
 *
 * Vercel injects these only when the project exposes system environment
 * variables, and AGENTS.md records that this is not visible from inside the
 * repository. So a missing value is written into the issue as missing —
 * an absent value that says it is absent is evidence; a missing table row
 * silently returns the report to being a memory.
 */
export function deploymentFacts(env: Env = process.env): DeploymentFacts {
  return {
    commit: env.VERCEL_GIT_COMMIT_SHA?.trim() || null,
    branch: env.VERCEL_GIT_COMMIT_REF?.trim() || null,
    environment: env.VERCEL_ENV?.trim() || null,
  };
}

export function issueHtmlUrl(issueNumber: number): string {
  return `https://github.com/${GITHUB_REPO_FULL}/issues/${issueNumber}`;
}

export function openReportsHtmlUrl(): string {
  return (
    `https://github.com/${GITHUB_REPO_FULL}/issues` +
    `?q=is%3Aissue+is%3Aopen+label%3A${AGENT_REPORT_LABEL}`
  );
}

/** `agent-report` on everything, plus one label per kind. */
export function labelsForReport(kind: string): string[] {
  return [AGENT_REPORT_LABEL, `report:${kind}`];
}
