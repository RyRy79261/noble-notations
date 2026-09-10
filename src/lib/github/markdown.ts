import 'server-only';

/**
 * Turning an agent's words into an issue body that cannot act on GitHub.
 *
 * The body is agent-written text landing in a public repository. Three
 * mechanisms, one per class of field:
 *
 *   title     — flattened to one line of plain text.
 *   body      — escaped so the agent's text cannot form Markdown structure,
 *               then wrapped so every construct GitHub links or notifies
 *               sits in a code span, then quoted so a reader can see where
 *               the agent's words end and the server's facts begin.
 *   payload,
 *   response  — emitted inside a fenced code block, where GitHub links and
 *               notifies nothing and the bytes survive.
 *
 * WHY THE BODY IS ESCAPED AND NOT ONLY WRAPPED. The wrapping works because
 * GitHub does not notify inside a code span, and that holds only while every
 * backtick in the document is one this file inserted. One unpaired backtick
 * in the agent's prose — an unclosed inline span while quoting a field name,
 * which is an ordinary thing to write in a bug report — pairs with the
 * backtick inserted in front of the mention instead:
 *
 *   in    The error was `foo @ryanjnoble
 *   out   The error was `foo `@ryanjnoble`
 *
 * CommonMark pairs backtick runs left to right, so the code span is "foo "
 * and the mention is live text beside it. Every backtick the agent wrote is
 * therefore backslash-escaped first, and the specification is explicit that
 * an escaped backtick cannot open a code span. Three more characters go the
 * same way, and all four are invisible once escaped:
 *
 *   `    no code span and no fence can form from the agent's text
 *   <    no raw HTML — GitHub's sanitiser keeps <img> and <a> — and no HTML
 *        comment, so the prose cannot mint a fingerprint marker
 *   [ ]  no Markdown link and no image, so no remote beacon and no
 *        attacker-chosen link target under this project's byline
 *   \    or the agent's own backslash would escape the escape
 *
 * A leading `#` is escaped too, so the prose cannot grow a heading that
 * imitates one the server writes. The cost is that a code span an agent
 * wrote renders with its backticks visible. That is a fair price: the
 * evidence fields, which are the ones worth reading as code, are fenced.
 *
 * On closing keywords, because it is the question people ask: a body saying
 * "fixes #9" closes nothing. GitHub's closing keywords act in pull request
 * descriptions and commit messages, not in issue bodies. The dangerous half
 * is the reference `#9`, which posts a "referenced this issue" event on
 * somebody else's thread. Rule 2 below wraps it in a code span, so the
 * reference never forms and the keyword is left inert beside it. There is
 * deliberately no keyword blocklist: it would be incomplete and it would
 * mangle honest prose.
 *
 * Deliberately NOT neutralised: a bare 7-40 character hex run. Wrapping it
 * would mangle every commit hash a report mentions, and a bare SHA produces
 * at worst a dead link, never a notification. Written down so nobody adds it
 * later thinking it was forgotten.
 *
 * HTML in the EVIDENCE is left alone. GitHub sanitises HTML in issue bodies,
 * and the evidence is fenced, so nothing there can render. The prose is a
 * different case: the sanitiser permits `<img>` and `<a>`, so an escaped `<`
 * is what keeps a beacon out of the body.
 */
import {
  REPORT_MARKER_VERSION,
  type DeploymentFacts,
} from '@/lib/github/config';

/** The evidence cap, matching the schema's own `max(8000)`. */
const EVIDENCE_LIMIT = 8000;

const TITLE_LIMIT = 120;

/**
 * Every construct GitHub autolinks or notifies on, in one alternation.
 *
 * One pass, not five. A second pass would run over the backticks the first
 * pass inserted: `@` inside an already-wrapped github.com URL would be
 * wrapped again and the Markdown would break. Ordering inside the
 * alternation puts the longest construct first, so `owner/repo#12` is
 * wrapped whole rather than as two pieces.
 *
 * Two boundary rules are worth stating, because both were wrong once. The
 * mention rule excludes only a letter, a digit and an underscore in front of
 * the `@`, so an email local part is still skipped while `-@user`, `/@user`
 * and `@@user` are caught; GitHub treats those as mention boundaries and the
 * older rule did not. And GFM autolinks a `www.` host with no scheme, so
 * `www.github.com/…` needs its own alternative beside the scheme-carrying
 * one. No alternative may swallow a backslash or a backtick: the escaping
 * pass puts those in front of the characters it neutralises, and a match
 * that ate one would carry it into the code span and break the pairing.
 */
const LINKING = new RegExp(
  [
    // a github.com URL — an issue, PR or commit link cross-references too
    'https?://(?:www\\.)?github\\.com/[^\\s`\\\\]+',
    // www.github.com/… — GFM autolinks a bare `www.` host with no scheme
    'www\\.github\\.com/[^\\s`\\\\]+',
    // owner/repo#123
    '\\b[A-Za-z0-9][\\w.-]*/[\\w.-]+#\\d{1,9}\\b',
    // GH-123
    '\\bGH-\\d{1,9}\\b',
    // @user, @org/team — the notification risk
    '(?<![A-Za-z0-9_])@[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?(?:/[A-Za-z0-9._-]{1,80})?',
    // #123 — the cross-reference risk
    '(?<![A-Za-z0-9_#-])#\\d{1,9}\\b',
  ].join('|'),
  'gi',
);

const BACKTICK = '`';

/**
 * The characters the agent's prose may not spend, and a leading `#`.
 *
 * Each one is ASCII punctuation, so CommonMark renders the escaped form as
 * the character itself: the escape is invisible to a reader. The `#` rule
 * fires only on the ATX heading form — one to six hashes then a space or the
 * end of the line — so a cross-reference like `#9` is left for `LINKING` to
 * wrap. Escaping it here instead would put a backslash in front of the
 * inserted backtick and cancel the code span.
 */
function escapeStructure(text: string): string {
  return text
    .replace(/[\\`<[\]]/g, (c) => `\\${c}`)
    .replace(/^( {0,3})(#{1,6})(?=\s|$)/gm, '$1\\$2');
}

/**
 * The agent's prose, quoted.
 *
 * The server's own block — the commit above all — is the one fact a memory
 * cannot corrupt, and nothing in the rendered issue said which half of it
 * the server wrote. A blockquote says so at a glance, and it costs the
 * reader nothing.
 */
function blockquote(text: string): string {
  return text
    .split('\n')
    .map((line) => (line.length > 0 ? `> ${line}` : '>'))
    .join('\n');
}

/**
 * A title, flattened.
 *
 * GitHub renders an issue title as plain text — no Markdown, no mention, no
 * cross-reference. That could not be verified against live documentation
 * from this machine, so it is stated as an assumption; if it is wrong the
 * cost is a cosmetic autolink, never a notification.
 *
 * Control characters become a space rather than nothing, so a title written
 * across two lines does not have its words glued together. Format characters
 * are deleted outright: a zero-width joiner or the right-to-left override
 * used to disguise text in a list view has no width to preserve.
 */
export function neutraliseTitle(raw: string): string {
  const flat = raw
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (flat.length <= TITLE_LIMIT) return flat;
  const cut = flat.slice(0, TITLE_LIMIT - 1);
  const boundary = cut.lastIndexOf(' ');
  return `${(boundary > 40 ? cut.slice(0, boundary) : cut).trimEnd()}…`;
}

/**
 * Wrap every match in a code span.
 *
 * There was a test here for a match already flanked by backticks, which
 * returned it unwrapped. It has to go with the escaping pass: after that
 * pass a backtick beside a match can only be an escaped one, and leaving the
 * construct bare between two escaped backticks would leave it live.
 */
function wrapLinkingConstructs(text: string): string {
  return text.replace(LINKING, (match) => `${BACKTICK}${match}${BACKTICK}`);
}

/** The prose field. Rendered as Markdown, so it is the dangerous one. */
export function neutraliseBody(raw: string): string {
  const text = raw
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(/\p{Cc}/gu, (c) => (c === '\n' || c === '\t' ? c : ''))
    .replace(/\p{Cf}/gu, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  // Escape first, wrap second. The order is the whole of the guarantee: it
  // makes every backtick that remains a delimiter one this file inserted, so
  // the code spans are balanced by construction.
  return wrapLinkingConstructs(escapeStructure(text));
}

/**
 * The verbatim evidence. No NFKC: `payload` and `response` are what went on
 * the wire, and a normalisation that rewrites them turns evidence back into
 * a paraphrase. Only characters that cannot survive a Markdown document go.
 */
export function cleanEvidence(raw: string): string {
  const text = raw
    .replace(/\r\n?/g, '\n')
    .replace(/\p{Cc}/gu, (c) => (c === '\n' || c === '\t' ? c : ''))
    .replace(/\p{Cf}/gu, '');
  if (text.length <= EVIDENCE_LIMIT) return text;
  return `${text.slice(0, EVIDENCE_LIMIT)}\n… truncated at ${EVIDENCE_LIMIT} characters`;
}

function looksLikeJson(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

/**
 * Put content in a fence that content cannot break out of.
 *
 * CommonMark: a fence closes only on a run of at least as many backticks as
 * it opened with. So the opening run must exceed the longest run inside.
 */
export function fence(content: string): string {
  const runs = [...content.matchAll(/`+/g)].map((m) => m[0].length);
  const bar = BACKTICK.repeat(Math.max(3, Math.max(0, ...runs) + 1));
  const language = looksLikeJson(content) ? 'json' : 'text';
  return `${bar}${language}\n${content}\n${bar}`;
}

/**
 * The inline form of `fence`, for a value that is one word.
 *
 * CommonMark: a code span closes on the first run of exactly as many
 * backticks as opened it, so the barrier must be longer than any run inside,
 * and content that starts or ends with a backtick needs a space of padding.
 */
export function codeSpan(content: string): string {
  const flat = content.replace(/\s+/g, ' ').trim();
  const runs = [...flat.matchAll(/`+/g)].map((m) => m[0].length);
  const bar = BACKTICK.repeat(Math.max(1, Math.max(0, ...runs) + 1));
  const pad = flat.startsWith(BACKTICK) || flat.endsWith(BACKTICK) ? ' ' : '';
  return `${bar}${pad}${flat}${pad}${bar}`;
}

/**
 * The invisible key the dedup matches on. `v1` so a future format change is
 * detectable rather than silently unmatched.
 */
export function marker(fingerprint: string, occurrence?: number): string {
  const tail = occurrence == null ? '' : ` occurrence=${occurrence}`;
  return (
    `<!-- noble-notations:agent-report ${REPORT_MARKER_VERSION} ` +
    `fingerprint=${fingerprint}${tail} -->`
  );
}

/**
 * The marker as `sections` writes it: first, and at the start of the body.
 *
 * Anchoring matters. A substring test over the whole body let the agent's
 * own prose claim a fingerprint — the hash is deterministic and public, so a
 * report could be written to swallow every later report of a fault nobody
 * has seen, and an honest report ABOUT the dedup would do it by accident.
 * Nothing an agent writes can occupy position 0 of a composed body, and the
 * escaping pass stops its prose forming an HTML comment at all. Two
 * independent controls, because this one decides where evidence lands.
 */
const MARKER_AT_START = new RegExp(
  `^\\s*<!-- noble-notations:agent-report ${REPORT_MARKER_VERSION} ` +
    `fingerprint=([0-9a-f]{12})(?: occurrence=\\d+)? -->`,
);

/** How a stored issue body is tested for a match. */
export function bodyCarriesFingerprint(
  body: string | null,
  fingerprint: string,
): boolean {
  return MARKER_AT_START.exec(body ?? '')?.[1] === fingerprint;
}

export interface ReportBodyParts {
  fingerprint: string;
  /** Redacted and neutralised prose. */
  body: string;
  /** Redacted and cleaned evidence. Absent sections are omitted whole. */
  toolName?: string;
  payload?: string;
  response?: string;
  facts: DeploymentFacts;
  filedAt: string;
  redactions: number;
  dedupCheckFailed: boolean;
  /** Set when this filing matches an issue that is closed. */
  previousIssueNumber?: number;
  /** Set on a comment: which occurrence of the fault this is. */
  occurrence?: number;
}

function factRow(
  label: string,
  value: string | null,
  variableName: string,
): string {
  const cell = value
    ? `${BACKTICK}${value}${BACKTICK}`
    : `${variableName} was not set on this deployment`;
  return `| ${label} | ${cell} |`;
}

function sections(parts: ReportBodyParts, headline: string): string {
  const out: string[] = [
    marker(parts.fingerprint, parts.occurrence),
    headline,
    // Quoted, so the agent's words and the server's facts are told apart on
    // sight. The commit below is the one fact a memory cannot corrupt, and a
    // reader has to be able to see that the server wrote it.
    blockquote(parts.body),
  ];

  if (parts.previousIssueNumber != null) {
    // The one place a bare `#n` is intentionally not neutralised. The server
    // wrote it, not the agent, so the cross-reference is deliberate: it is
    // what lets a maintainer see that the fault came back after a fix.
    out.push(
      `This fault matches issue #${parts.previousIssueNumber}, which is ` +
        'closed. The tool did not open it again. It filed this issue ' +
        'instead, so both occurrences keep their own evidence.',
    );
  }

  if (parts.toolName) {
    out.push('### The tool that was called', codeSpan(parts.toolName));
  }
  if (parts.payload) {
    out.push('### What the agent sent', fence(parts.payload));
  }
  if (parts.response) {
    out.push('### What came back', fence(parts.response));
  }

  out.push(
    '### The deployment',
    [
      '|             |                                          |',
      '| ----------- | ---------------------------------------- |',
      factRow('Commit', parts.facts.commit, 'VERCEL_GIT_COMMIT_SHA'),
      factRow('Branch', parts.facts.branch, 'VERCEL_GIT_COMMIT_REF'),
      factRow('Environment', parts.facts.environment, 'VERCEL_ENV'),
      `| Filed at | ${parts.filedAt} |`,
      `| Fingerprint | ${BACKTICK}${parts.fingerprint}${BACKTICK} |`,
    ].join('\n'),
  );

  if (parts.redactions > 0) {
    // A maintainer must know the evidence is incomplete.
    out.push(
      `${parts.redactions} ${parts.redactions === 1 ? 'value was' : 'values were'} ` +
        'removed from the evidence because ' +
        `${parts.redactions === 1 ? 'it' : 'they'} matched a credential pattern.`,
    );
  }

  if (parts.dedupCheckFailed) {
    // So a maintainer reading two identical issues knows why there are two.
    out.push(
      'The tool could not read the existing reports, so it could not check ' +
        'for a duplicate. This report may repeat one that is already filed.',
    );
  }

  return `${out.join('\n\n')}\n`;
}

export function composeIssueBody(parts: ReportBodyParts): string {
  return sections(parts, '**An agent filed this through the MCP connector.**');
}

export function composeCommentBody(parts: ReportBodyParts): string {
  // The full evidence again, not a "+1". The second occurrence may carry a
  // different commit, payload and response, and that difference is what
  // separates "still broken" from "a different bug with the same title".
  return sections(
    parts,
    '**Another agent hit this, through the MCP connector.**',
  );
}
