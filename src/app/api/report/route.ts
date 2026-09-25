import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminUser, isAdminConfigured } from '@/lib/mcp/admin-session';
import {
  apiBaseUrl,
  deploymentFacts,
  GITHUB_REPO_FULL,
  issueReportingConfigured,
  issueToken,
} from '@/lib/github/config';
import { createGitHubIssues, GitHubApiError } from '@/lib/github/client';
import { redact } from '@/lib/github/redact';
import { fence, neutraliseBody, neutraliseTitle } from '@/lib/github/markdown';
import { reportablePath } from '@/lib/report-path';

/**
 * Shake the phone on the site, and a report becomes a GitHub issue.
 *
 * Ported in spirit from Intake Tracker's `/api/bug-report`, onto what this
 * repository already has for `report_issue`: the same fine-grained
 * `GITHUB_ISSUE_TOKEN`, the same hardcoded repository, the same redaction
 * and the same Markdown neutralising. No new credential is needed.
 *
 * **THE OWNER ONLY.** The site is public and the repository is public. A
 * report form open to every reader is a way for anybody to write issues
 * under the owner's token, so filing needs the administrator session the
 * connector's consent screen already uses — signed in, and on
 * `ALLOWED_EMAILS`. `GET` answers whether that is true, and the sheet stays
 * unmounted for everybody else: a reader who shakes a phone sees nothing.
 *
 * **What goes in.** The person's words, the page they were on (with an
 * upload token replaced), the browser, the screen, the deployed commit, and
 * the last errors the tab caught — which the sheet shows before it sends.
 * Every free-text field passes `redact` for credentials and then the
 * Markdown neutraliser, because the issue is rendered on github.com and a
 * report must not be able to mention a person or close an issue.
 */
export const dynamic = 'force-dynamic';

const SITE_REPORT_LABEL = 'site-report';

/**
 * A soft ceiling per server instance: ten reports in ten minutes. The gate
 * that matters is the session; this stops a stuck retry loop on one phone
 * from filing a page of duplicates.
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_IN_WINDOW = 10;
const recent: number[] = [];

const bodySchema = z.object({
  kind: z.enum(['bug', 'idea']),
  description: z.string().trim().min(1).max(5000),
  page: z.string().max(500),
  environment: z
    .array(z.object({ label: z.string().max(60), value: z.string().max(500) }))
    .max(20),
  errors: z
    .array(
      z.object({
        at: z.string().max(40),
        kind: z.enum(['error', 'rejection']),
        message: z.string().max(1000),
        source: z.string().max(500).nullable(),
      }),
    )
    .max(20),
});

function json(status: number, body: unknown) {
  return NextResponse.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

/**
 * Whether this visitor may file. Asked once per visit by every browser, so
 * the common answer is the cheap one: with no Neon Auth session cookie on
 * the request there is nobody to look up, and the upstream session call is
 * never made. Only a request that carries one pays for `getAdminUser`.
 */
export async function GET(request: Request) {
  const hasSession = (request.headers.get('cookie') ?? '').includes(
    'neon-auth.session_token=',
  );
  const enabled =
    hasSession &&
    issueReportingConfigured() &&
    isAdminConfigured() &&
    (await getAdminUser()) !== null;
  return json(200, { enabled });
}

function clean(text: string): { text: string; count: number } {
  const r = redact(text);
  return { text: r.text, count: r.count };
}

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) {
    return json(401, {
      error: 'Sign in to send a report.',
      signIn: true,
    });
  }
  const token = issueToken();
  if (!token) {
    return json(503, {
      error:
        'Reports are not set up on this deployment. GITHUB_ISSUE_TOKEN is not set.',
    });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return json(400, {
      error: 'The report is not complete. Write what happened.',
    });
  }
  const input = parsed.data;

  const now = Date.now();
  while (recent.length && now - recent[0]! > WINDOW_MS) recent.shift();
  if (recent.length >= MAX_IN_WINDOW) {
    return json(429, {
      error: 'Too many reports in ten minutes. Wait, then send it again.',
    });
  }

  let redactions = 0;
  const description = clean(input.description);
  redactions += description.count;
  const [pathname, ...query] = input.page.split('?');
  const page = reportablePath(
    pathname ?? '',
    query.length ? `?${query.join('?')}` : '',
  );

  const firstLine = description.text.split('\n')[0]?.trim() ?? '';
  const title = neutraliseTitle(
    `[site report] ${firstLine || (input.kind === 'bug' ? 'Something broke' : 'An idea')}`,
  );

  const facts = deploymentFacts();
  const env = [
    ['Page', page],
    ['Commit', facts.commit ?? 'unknown'],
    ['Branch', facts.branch ?? 'unknown'],
    ['Environment', facts.environment ?? 'unknown'],
    ...input.environment.map((f) => [f.label, f.value] as const),
  ]
    .map(([label, value]) => {
      const c = clean(`${label}: ${value}`);
      redactions += c.count;
      return c.text;
    })
    .join('\n');

  const errorLines = input.errors
    .map((e) => {
      const c = clean(
        `[${e.at}] ${e.kind}: ${e.message}${e.source ? `\n  at ${e.source}` : ''}`,
      );
      redactions += c.count;
      return c.text;
    })
    .join('\n\n');

  const body = [
    `**Filed from the website** by the signed-in owner, with the phone shaken or the sheet opened by hand. The text below is theirs.`,
    `## ${input.kind === 'bug' ? 'What happened' : 'The idea'}`,
    neutraliseBody(description.text),
    `<details>\n<summary>Where and on what</summary>\n\n${fence(env)}\n</details>`,
    input.errors.length
      ? `<details>\n<summary>Errors the page caught (${input.errors.length})</summary>\n\n${fence(errorLines)}\n</details>`
      : '_The page caught no errors before the report._',
    redactions
      ? `_${redactions} value(s) that looked like a credential were removed._`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const client = createGitHubIssues({ token, baseUrl: apiBaseUrl() });
  try {
    const issue = await client.createIssue({
      title,
      body,
      labels: [SITE_REPORT_LABEL, `report:${input.kind}`],
    });
    recent.push(now);
    return json(200, { number: issue.number, url: issue.htmlUrl });
  } catch (err) {
    const status = err instanceof GitHubApiError ? err.status : null;
    console.error('[site-report] filing failed', status, err);
    return json(502, {
      error:
        status === 401
          ? `GitHub refused the token. Check GITHUB_ISSUE_TOKEN for ${GITHUB_REPO_FULL}.`
          : 'GitHub did not take the report. Try again in a minute.',
    });
  }
}
