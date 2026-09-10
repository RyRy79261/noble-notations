import 'server-only';

/**
 * The policy: fingerprint, dedup, the two caps, and what the caller is told.
 *
 * This module takes a `GitHubIssuesClient`. It never sees `fetch`, a URL or
 * a header, so it cannot reach the network by itself and a fake with three
 * methods is a complete substitute for GitHub.
 *
 * Read `docs/mcp-connector.md` for why this tool exists at all. The short
 * version: a report that carries a memory of what happened gets three claims
 * out of six wrong. A report that carries the tool, the payload, the
 * response and the deployed commit settles all six in one reading.
 */
import { createHash } from 'node:crypto';
import type { ReportIssueInput } from '@/lib/domain/schemas';
import {
  deploymentFacts,
  GITHUB_REPO_FULL,
  issueHtmlUrl,
  labelsForReport,
  openReportsHtmlUrl,
  OPEN_REPORT_CAP,
  type DeploymentFacts,
} from '@/lib/github/config';
import {
  GitHubApiError,
  type GitHubIssuesClient,
  type IssueSummary,
} from '@/lib/github/client';
import {
  bodyCarriesFingerprint,
  cleanEvidence,
  composeCommentBody,
  composeIssueBody,
  neutraliseBody,
  neutraliseTitle,
  type ReportBodyParts,
} from '@/lib/github/markdown';
import { redact } from '@/lib/github/redact';

/** The tool did not file the report and the caller must be told why. */
export class ReportFailedError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ReportFailedError';
  }
}

export type ReportOutcome =
  | {
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
  | {
      status: 'commented';
      issueNumber: number;
      url: string;
      commentUrl: string;
      fingerprint: string;
      redactions: number;
      message: string;
    }
  | {
      status: 'capped';
      reason: 'open-reports' | 'burst' | 'comments';
      openReports?: number;
      /** Set when the comment cap stopped a write onto an issue that exists. */
      issueNumber?: number;
      limit: number;
      url: string;
      message: string;
    };

// ─────────────────────────────────────────────────────────────────────────
// The fingerprint
// ─────────────────────────────────────────────────────────────────────────

/**
 * Normalisation is over punctuation and case only, and that is the whole
 * argument. "get_recipe returns 500 for slug `x`" and "Get_recipe returns
 * 500 for slug x." fingerprint the same, because that IS the retry loop. Two
 * genuinely different sentences fingerprint differently, and that is
 * correct: a wrong merge is worse than a duplicate, because the duplicate is
 * visible and the merge is not.
 */
function normaliseForFingerprint(title: string): string {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 12 hex characters — 48 bits. A collision needs roughly sixteen million
 * distinct reports.
 *
 * `kind` and `toolName` are in the hash, so "get_recipe is slow" filed as a
 * bug and the same sentence filed as an idea stay two issues.
 *
 * The hash reads the title the agent sent, before redaction and before the
 * title is flattened for GitHub. That keeps "the same title deduplicates"
 * true no matter what the neutralising steps do to the rendered title.
 */
export function fingerprint(input: ReportIssueInput): string {
  return createHash('sha256')
    .update(
      `${input.kind}\n${input.toolName?.trim().toLowerCase() ?? ''}\n` +
        normaliseForFingerprint(input.title),
    )
    .digest('hex')
    .slice(0, 12);
}

// ─────────────────────────────────────────────────────────────────────────
// The per-process caps
// ─────────────────────────────────────────────────────────────────────────

const BURST_LIMIT = 5;
const BURST_WINDOW_MS = 60 * 60_000;

/**
 * How many comments this process adds to one issue, for one fingerprint, in
 * the window.
 *
 * METER THE WRITES, NOT THE ISSUES. The dedup was built to catch the retry
 * loop, and it does stop the second ISSUE — but it stopped nothing else: the
 * comment path consulted no cap at all, so twenty identical calls produced
 * one issue and nineteen comments, each carrying the whole evidence block
 * and each answering `ok()`, which is precisely the success a model reads as
 * permission to go again. Three is the ceiling because the second occurrence
 * is the valuable one: it carries a different commit, payload and response,
 * and that difference separates "still broken" from "a different bug with
 * the same title". A fourth is a loop.
 */
const COMMENT_LIMIT = 3;

/** userId → the times this process filed for that principal. */
const recentFilings = new Map<string, number[]>();

/** userId + fingerprint → the times this process commented for that fault. */
const recentComments = new Map<string, number[]>();

function windowed(
  store: Map<string, number[]>,
  key: string,
  now: number,
): number[] {
  const times = (store.get(key) ?? []).filter((t) => now - t < BURST_WINDOW_MS);
  if (times.length === 0) store.delete(key);
  else store.set(key, times);
  return times;
}

/**
 * A speed bump, not a control, and the caveat has to be stated plainly or
 * somebody will size the real cap too loosely. On Vercel each lambda
 * instance holds its own memory, so a burst can fan out across instances and
 * this counter sees only its share. `OPEN_REPORT_CAP`, counted from GitHub,
 * is the control.
 *
 * It is consulted on one path only: the one where the issues list call
 * failed and the open-report cap could therefore not be enforced. That is
 * the reason it exists — without it, an agent that can make the list call
 * fail files without limit. It is deliberately NOT consulted on the healthy
 * path, because the incident that created this tool produced six distinct
 * real problems in one session and a five-per-hour limit would have refused
 * the sixth. The open-report cap is sized at ten for exactly that case.
 */
function burstCount(userId: string, now: number): number {
  return windowed(recentFilings, userId, now).length;
}

function recordFiling(userId: string, now: number): void {
  const times = windowed(recentFilings, userId, now);
  times.push(now);
  recentFilings.set(userId, times);
}

/**
 * Take a comment slot, or refuse. The count is taken BEFORE the write and is
 * never given back: a write that may have landed has to cost its slot, and
 * failing closed on a public write is the right way round.
 *
 * There is no `await` between the read and the write inside this function,
 * and JavaScript runs one thread, so concurrent calls cannot both see the
 * same count. That is the whole reason it is one function rather than a
 * check beside an increment.
 */
function reserveComment(
  userId: string,
  fingerprint: string,
  now: number,
): boolean {
  const key = `${userId}\n${fingerprint}`;
  const times = windowed(recentComments, key, now);
  if (times.length >= COMMENT_LIMIT) return false;
  times.push(now);
  recentComments.set(key, times);
  return true;
}

/**
 * Issues this process has asked GitHub to create and not yet heard about.
 *
 * The open-report cap reads a count from GitHub and then acts on it, with
 * nothing held in between. Forty concurrent calls with forty different
 * titles therefore all read the same zero and all filed, against a cap of
 * ten — MCP calls are independent HTTP POSTs, so a client makes that happen
 * with no special effort. This is the reservation the window needed: it is
 * counted in with the reported total before the decision, and released in a
 * `finally` when the request ends.
 *
 * It bounds ONE INSTANCE. Vercel fans out across lambdas, and a hard global
 * bound would have to come from a shared store — a row beside
 * `mcp_audit_log` — not from a list-then-create window. That is a bigger
 * change than this tool needs, and it is written down here so the next
 * person sizes the risk correctly rather than reading the cap as absolute.
 */
let createsInFlight = 0;

// ─────────────────────────────────────────────────────────────────────────
// What the caller is told
// ─────────────────────────────────────────────────────────────────────────

const REDACTION_NOTICE = (count: number): string =>
  `The tool removed ${count} ${count === 1 ? 'value' : 'values'} from your ` +
  `report. ${count === 1 ? 'It looked' : 'They looked'} like ` +
  `${count === 1 ? 'a credential' : 'credentials'}. Check what you sent. If ` +
  'a credential is real, change it now.';

const DEDUP_SKIPPED_NOTICE =
  'The tool could not read the reports that are already filed. It could ' +
  'not check for a duplicate. This report may repeat one that is already ' +
  'there.';

function filedMessage(args: {
  issueNumber: number;
  previousIssueNumber?: number;
  redactions: number;
  duplicateCheckRan: boolean;
}): string {
  const parts = [`Filed as issue ${args.issueNumber}.`];

  if (args.previousIssueNumber != null) {
    parts.push(
      `This fault matches issue ${args.previousIssueNumber}. Issue ` +
        `${args.previousIssueNumber} is closed. The tool did not open it ` +
        'again. It filed a new issue and named the old one inside it. A ' +
        'person will decide if the fault came back.',
    );
  }

  parts.push(`Address: ${issueHtmlUrl(args.issueNumber)}`);
  parts.push(
    'The issue holds your payload, the response and the commit that is ' +
      'deployed.',
  );
  parts.push(
    'Go on with your task. If this fault happens again, call report_issue ' +
      `with the same title. The tool then adds a comment to issue ` +
      `${args.issueNumber}. It does not file a second issue.`,
  );

  if (args.redactions > 0) parts.push(REDACTION_NOTICE(args.redactions));
  if (!args.duplicateCheckRan) parts.push(DEDUP_SKIPPED_NOTICE);

  return parts.join('\n\n');
}

function commentedMessage(issueNumber: number, redactions: number): string {
  const parts = [
    `This report matches issue ${issueNumber}. Issue ${issueNumber} is ` +
      'open. The tool added your evidence to that issue as a comment. It ' +
      'did not file a second issue.',
    `Address: ${issueHtmlUrl(issueNumber)}`,
    'Go on with your task. Do not call report_issue again for this fault.',
  ];
  if (redactions > 0) parts.push(REDACTION_NOTICE(redactions));
  return parts.join('\n\n');
}

/**
 * The count and the limit are two numbers, and the message used to print the
 * count as both. Open reports can pass ten — a person can apply the label by
 * hand, the degraded path files past it, and two instances can race — and an
 * agent then read "This project has 12 open reports. That is the limit." A
 * fabricated fact, in the one tool whose whole purpose is not fabricating
 * facts.
 */
function cappedMessage(openReports: number): string {
  return [
    'The tool did not file this report.',
    `This project has ${openReports} open reports from agents. The limit is ` +
      `${OPEN_REPORT_CAP}. The limit stops one agent from filling the list.`,
    `Read them at:\n${openReportsHtmlUrl()}`,
    'Tell the person you work with about this fault. Give them the tool ' +
      'name, the payload and the response. Do not call report_issue again ' +
      'in this session.',
  ].join('\n\n');
}

/**
 * "This connector" was wrong twice over: the counter is keyed by user, so two
 * connectors of one owner share it, and it is per process, so a second
 * instance reports zero. The sentence says what is true of any instance.
 */
function burstCappedMessage(): string {
  return [
    'The tool did not file this report.',
    `The tool filed ${BURST_LIMIT} reports for you in the last hour.`,
    'The tool also cannot read the reports that are already filed. It ' +
      'stopped here so it does not fill the list.',
    `Read the open reports at:\n${openReportsHtmlUrl()}`,
    'Tell the person you work with about this fault. Give them the tool ' +
      'name, the payload and the response. Do not call report_issue again ' +
      'in this session.',
  ].join('\n\n');
}

function commentCappedMessage(issueNumber: number): string {
  return [
    'The tool did not add this report to an issue.',
    `Your evidence is on issue ${issueNumber} already. The tool added ` +
      `${COMMENT_LIMIT} comments for this fault. That is the limit for one ` +
      'fault.',
    `Address: ${issueHtmlUrl(issueNumber)}`,
    'Stop. Do not call report_issue again for this fault. Tell the person ' +
      'you work with if the fault continues.',
  ].join('\n\n');
}

/**
 * GitHub's own message never travels. Its error bodies carry documentation
 * URLs and rate-limit detail that mean nothing to the caller and could name
 * internals. The status code is composed from, and nothing else.
 *
 * The split matters more than the wording. "Do not call again" is right for
 * a fault in the server, because a retry cannot fix it. "Call one more time"
 * is right for a 5xx, because a retry probably can.
 */
function failureText(err: GitHubApiError): string {
  const retryParagraph =
    'Call report_issue one more time. If it fails again, tell the person ' +
    'you work with. Give them the tool name, the payload and the response.';
  const escalateParagraph =
    'Tell the person you work with about this fault. Give them the tool ' +
    'name, the payload and the response. Do not call report_issue again in ' +
    'this session.';

  if (err.status === 401) {
    return [
      "The tool did not file this report. GitHub refused the server's " +
        'credential (401). The fault is in the server. Your report is ' +
        'correct.',
      escalateParagraph,
    ].join('\n\n');
  }
  if (err.status === 403) {
    return [
      "The tool did not file this report. GitHub refused the server's " +
        'permission (403). The fault is in the server. Your report is ' +
        'correct.',
      escalateParagraph,
    ].join('\n\n');
  }
  if (err.status === 404) {
    return [
      'The tool did not file this report. GitHub cannot find the ' +
        'repository (404). The fault is in the server. Your report is ' +
        'correct.',
      escalateParagraph,
    ].join('\n\n');
  }
  if (err.status === 422) {
    return [
      'The tool did not file this report. GitHub refused the report (422). ' +
        'The label "agent-report" may not exist in the repository. The ' +
        'fault is in the server. Your report is correct.',
      escalateParagraph,
    ].join('\n\n');
  }
  if (err.status === 429) {
    const wait =
      err.retryAfterSeconds != null
        ? ` Try again after ${err.retryAfterSeconds} seconds.`
        : '';
    return [
      'The tool did not file this report. GitHub asked the tool to wait.' +
        wait,
      retryParagraph,
    ].join('\n\n');
  }
  if (err.status === 0) {
    return [
      'The tool did not file this report. The tool could not reach GitHub. ' +
        'Your report is not saved.',
      retryParagraph,
    ].join('\n\n');
  }
  if (err.status >= 500) {
    return [
      `The tool did not file this report. GitHub answered with an error ` +
        `(${err.status}). Your report is not saved.`,
      retryParagraph,
    ].join('\n\n');
  }
  return [
    'The tool did not file this report. GitHub refused it ' +
      `(${err.status}). The fault is in the server. Your report is correct.`,
    escalateParagraph,
  ].join('\n\n');
}

function asReportFailure(err: unknown): ReportFailedError {
  if (err instanceof GitHubApiError) {
    return new ReportFailedError(failureText(err), err.status);
  }
  throw err;
}

/**
 * Every address an agent is given is built from the hardcoded repository.
 * This one arrives from the API, so it is checked against that constant
 * rather than trusted: under a misconfigured base URL the answer could name
 * anything, and the agent would be handed it as this project's address.
 */
function trustedCommentUrl(candidate: string, issueNumber: number): string {
  const prefix = `https://github.com/${GITHUB_REPO_FULL}/issues/`;
  return candidate.startsWith(prefix) ? candidate : issueHtmlUrl(issueNumber);
}

/**
 * The title, flattened — with a floor under it.
 *
 * `min(8)` counts UTF-16 code units, so a title of ten zero-width joiners
 * passes the schema and `neutraliseTitle` then deletes every one of them.
 * GitHub answers 422 to an empty title, and the 422 branch blames a missing
 * label: whoever read that went looking at labels for a fault that was in
 * the title. The fingerprint is taken from the raw title, so this substitution
 * cannot affect the dedup.
 */
function issueTitle(raw: string, kind: string): string {
  const flat = neutraliseTitle(raw);
  return flat.length >= 8
    ? flat
    : `A report of kind "${kind}" with no readable title`;
}

// ─────────────────────────────────────────────────────────────────────────
// The one entry point
// ─────────────────────────────────────────────────────────────────────────

export interface SubmitReportOptions {
  /**
   * Keys the in-memory burst counter. It NEVER reaches GitHub. Only
   * `title`, `body`, `kind`, `toolName`, `payload`, `response` and the
   * server-composed block are allowed out of this process; the identity
   * belongs in `mcp_audit_log`.
   */
  userId: string;
  facts?: DeploymentFacts;
}

export async function submitReport(
  input: ReportIssueInput,
  client: GitHubIssuesClient,
  options: SubmitReportOptions,
): Promise<ReportOutcome> {
  const fp = fingerprint(input);
  const facts = options.facts ?? deploymentFacts();
  const stamp = client.now();
  const filedAt = stamp.toISOString();

  // Redaction runs over the prose as well as the evidence: an agent writes a
  // token into a sentence as readily as into a field. The title is included
  // for the same reason, and the fingerprint is taken from the title before
  // this runs, so dedup is unaffected.
  const title = redact(input.title);
  const body = redact(input.body);
  const toolName = input.toolName ? redact(input.toolName) : null;
  const payload = input.payload ? redact(input.payload) : null;
  const response = input.response ? redact(input.response) : null;
  const redactions =
    title.count +
    body.count +
    (toolName?.count ?? 0) +
    (payload?.count ?? 0) +
    (response?.count ?? 0);

  const parts: Omit<ReportBodyParts, 'dedupCheckFailed'> = {
    fingerprint: fp,
    body: neutraliseBody(body.text),
    toolName: toolName ? cleanEvidence(toolName.text) : undefined,
    payload: payload ? cleanEvidence(payload.text) : undefined,
    response: response ? cleanEvidence(response.text) : undefined,
    facts,
    filedAt,
    redactions,
  };

  // The dedup runs before the filing, and a failed dedup must not lose the
  // report. The two failure modes are not symmetric: a lost report costs the
  // whole reason this tool exists, because the evidence is in the agent's
  // context right now and is gone the moment its turn ends. A duplicate
  // costs a maintainer one click, and every body carries the fingerprint, so
  // duplicates are findable and closable in bulk afterwards.
  let existing: IssueSummary[] | null = null;
  try {
    existing = await client.listAgentReports();
  } catch {
    existing = null;
  }

  let previousIssueNumber: number | undefined;

  if (existing) {
    const matches = existing.filter((issue) =>
      bodyCarriesFingerprint(issue.body, fp),
    );

    // An open match wins over a closed one.
    const open = matches.find((issue) => issue.state === 'open');
    if (open) {
      // The comment path is a WRITE, and it is metered like one. Without
      // this the dedup turned a loop that files many issues into a loop that
      // writes unlimited comments onto one, which is worse: the same volume
      // of agent-written text, in a place a maintainer cannot close.
      if (!reserveComment(options.userId, fp, stamp.getTime())) {
        return {
          status: 'capped',
          reason: 'comments',
          issueNumber: open.number,
          limit: COMMENT_LIMIT,
          url: issueHtmlUrl(open.number),
          message: commentCappedMessage(open.number),
        };
      }

      // A dedup is a success. `isError: true` on a success invites a retry,
      // which is the behaviour the dedup exists to stop.
      let comment;
      try {
        comment = await client.commentOnIssue(
          open.number,
          composeCommentBody({ ...parts, dedupCheckFailed: false }),
        );
      } catch (err) {
        throw asReportFailure(err);
      }
      return {
        status: 'commented',
        issueNumber: open.number,
        url: issueHtmlUrl(open.number),
        commentUrl: trustedCommentUrl(comment.htmlUrl, open.number),
        fingerprint: fp,
        redactions,
        message: commentedMessage(open.number, redactions),
      };
    }

    // A closed match is NOT reopened. Reopening on an agent's word is a lot
    // of trust to place in exactly the thing this tool exists to distrust,
    // and it destroys evidence: two occurrences merge into one thread where
    // nobody can see that the fault returned after a fix, on a different
    // commit, with a different payload. A new issue that names the old one
    // preserves both and costs one click to close as a duplicate.
    previousIssueNumber = matches.find(
      (issue) => issue.state === 'closed',
    )?.number;

    // `createsInFlight` is counted in, because a cap that reads a number and
    // then acts on it is not a cap under concurrency.
    const openReports =
      existing.filter((issue) => issue.state === 'open').length +
      createsInFlight;
    if (openReports >= OPEN_REPORT_CAP) {
      return {
        status: 'capped',
        reason: 'open-reports',
        openReports,
        limit: OPEN_REPORT_CAP,
        url: openReportsHtmlUrl(),
        message: cappedMessage(openReports),
      };
    }
  } else if (
    burstCount(options.userId, stamp.getTime()) + createsInFlight >=
    BURST_LIMIT
  ) {
    return {
      status: 'capped',
      reason: 'burst',
      limit: BURST_LIMIT,
      url: openReportsHtmlUrl(),
      message: burstCappedMessage(),
    };
  }

  // The reservation. There is no `await` between either cap above and this
  // line, so on one thread the check and the reservation cannot interleave
  // with another call. Released in the `finally`, whatever GitHub answers.
  createsInFlight += 1;

  let created;
  try {
    created = await client.createIssue({
      title: issueTitle(title.text, input.kind),
      body: composeIssueBody({
        ...parts,
        dedupCheckFailed: existing === null,
        previousIssueNumber,
      }),
      labels: labelsForReport(input.kind),
    });
  } catch (err) {
    throw asReportFailure(err);
  } finally {
    createsInFlight -= 1;
  }

  recordFiling(options.userId, stamp.getTime());

  return {
    status: 'filed',
    issueNumber: created.number,
    // Built from the hardcoded repository, never from what the API answered,
    // so the address the agent is given cannot be anything but this project.
    url: issueHtmlUrl(created.number),
    fingerprint: fp,
    commit: facts.commit,
    redactions,
    duplicateCheckRan: existing !== null,
    previousIssueNumber,
    message: filedMessage({
      issueNumber: created.number,
      previousIssueNumber,
      redactions,
      duplicateCheckRan: existing !== null,
    }),
  };
}
