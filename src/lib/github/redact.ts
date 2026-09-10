import 'server-only';

/**
 * Credential removal for agent-written evidence.
 *
 * The worst case here is specific to this system. An agent that pastes its
 * own request pastes `Authorization: Bearer mcp_at_…`, which is a live
 * credential for this very server, into a public repository. So redaction
 * runs over `payload`, `response` AND `body` — an agent writes a token into
 * prose as readily as into a field.
 *
 * The tool redacts, files, and says so. It does not refuse. Refusing on a
 * suspected secret loses the report, which is the failure this whole tool
 * exists to prevent, and these patterns have false positives. Counting the
 * removals and stating the count — in the issue and to the caller — is also
 * the only mechanism that tells an agent it just leaked something.
 *
 * THIS IS A BLOCKLIST, AND EVERY WORD WRITTEN ABOUT IT MUST SAY SO. It
 * removes values that match a known pattern. It cannot promise to remove
 * every credential, and a tool description that promises the stronger thing
 * invites an agent to paste one — into a public repository, where the paste
 * is not reversible the way a private log is. The tool description and the
 * `payload` field both say "a known credential pattern" for that reason.
 */

/**
 * A replacement, once inserted, is frozen: later rules never run over it.
 *
 * Without this, rule 1 turns `Authorization: Bearer mcp_at_x` into
 * `Authorization: Bearer [redacted: noble-notations token]` and rule 2 then
 * eats half of the placeholder, leaving `[redacted: authorization header]
 * noble-notations token]`. Freezing keeps the rules in the order the design
 * argues for and keeps their output readable.
 */
const PLACEHOLDER = /\[redacted: [a-z0-9 _-]+\]/g;

function redacted(label: string): string {
  return `[redacted: ${label.toLowerCase()}]`;
}

interface Rule {
  pattern: RegExp;
  replace: (...args: string[]) => string;
}

const RULES: Rule[] = [
  // 1. THIS SERVER'S OWN CREDENTIALS. The prefixes are from
  //    src/lib/mcp/tokens.ts. `mcp_client_` is deliberately absent: a client
  //    id is an identifier, not a secret, and it is evidence.
  {
    pattern: /\bmcp_(?:at|rt|ac|secret)_[A-Za-z0-9_-]{16,}/g,
    replace: () => redacted('noble-notations token'),
  },
  // 2. An Authorization header, in a header line or in a JSON object.
  {
    pattern:
      /\b(?:proxy-)?authorization\s*["']?\s*[:=]\s*["']?(?:bearer|basic|token)\s+[^\s"',}]+/gi,
    replace: () => redacted('authorization header'),
  },
  // 3. A bare bearer token.
  {
    pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{16,}={0,2}/g,
    replace: () => redacted('bearer token'),
  },
  // 4. GitHub credentials.
  {
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,
    replace: () => redacted('github token'),
  },
  {
    pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
    replace: () => redacted('github token'),
  },
  // 5. JWTs.
  {
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    replace: () => redacted('jwt'),
  },
  // 6. Connection-string userinfo. The scheme, the user and the host are the
  //    evidence — a report that says "the database refused me" is useless
  //    without them — so only the password goes.
  {
    pattern: /\b([a-z][a-z0-9+.-]*):\/\/([^\s:@/]+):([^\s@/]+)@/gi,
    replace: (_match, scheme, user) =>
      `${scheme}://${user}:${redacted('password')}@`,
  },
  // 7. keyword = value, keeping the key. The key is evidence; the value is
  //    not.
  //
  //    THE KEYWORD IS USUALLY THE TAIL OF A LONGER NAME. `GITHUB_ISSUE_TOKEN`,
  //    `DB_PASSWORD`, `NEON_AUTH_COOKIE_SECRET`, `refreshToken`. A leading
  //    `\b` sees none of them: an underscore is a word character, so there is
  //    no boundary in front of the keyword, and the commonest real spelling
  //    went out unredacted — including the name of the very credential this
  //    tool holds. The prefix is matched instead and kept, because the whole
  //    name is the evidence. It is bounded at 40 characters so a long run of
  //    letters cannot make this pattern backtrack.
  {
    pattern:
      /([A-Za-z0-9]{0,40}[_.-]?(?:api[_-]?key|secret|token|password|passwd|pwd|client[_-]?secret|access[_-]?key|private[_-]?key|service[_-]?role|credentials?|cookie|set-cookie))(\s*["']?\s*[:=]\s*["']?)([^\s"',}]{8,})/gi,
    replace: (_match, key, separator) =>
      `${key}${separator}${redacted(key.replace(/[^A-Za-z0-9 _-]/g, '-'))}`,
  },
  //    A bare `key` is deliberately not in the list above: `"key": "laab"` is
  //    ordinary evidence and redacting it would lose more than it saves. A
  //    key with a prefix is a different word — `X-Admin-Key`, `signing_key` —
  //    so it gets its own rule, which cannot fire without that prefix.
  {
    pattern:
      /([A-Za-z0-9]{1,40}[_.-]key)(\s*["']?\s*[:=]\s*["']?)([^\s"',}]{8,})/gi,
    replace: (_match, key, separator) =>
      `${key}${separator}${redacted(key.replace(/[^A-Za-z0-9 _-]/g, '-'))}`,
  },
  // 8. PEM blocks.
  {
    pattern:
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replace: () => redacted('private key'),
  },
  // 9. Vendor shapes.
  { pattern: /\bAKIA[0-9A-Z]{16}\b/g, replace: () => redacted('aws key') },
  {
    pattern: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g,
    replace: () => redacted('slack token'),
  },
  {
    pattern: /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}\b/g,
    replace: () => redacted('api key'),
  },
];

export interface Redaction {
  text: string;
  count: number;
}

function applyRule(text: string, rule: Rule, counter: { n: number }): string {
  return text.replace(rule.pattern, (match: string, ...rest: unknown[]) => {
    counter.n += 1;
    // `replace` appends the offset and the whole subject after the capture
    // groups. No rule here uses a named group, so dropping the last two
    // leaves exactly the captures.
    const groups = rest
      .slice(0, Math.max(0, rest.length - 2))
      .map((g) => (typeof g === 'string' ? g : ''));
    return rule.replace(match, ...groups);
  });
}

/** Run one rule over the parts of the text that are not already redacted. */
function applyOutsidePlaceholders(
  text: string,
  rule: Rule,
  counter: { n: number },
): string {
  let out = '';
  let index = 0;
  for (const found of text.matchAll(PLACEHOLDER)) {
    const start = found.index ?? 0;
    out += applyRule(text.slice(index, start), rule, counter);
    out += found[0];
    index = start + found[0].length;
  }
  return out + applyRule(text.slice(index), rule, counter);
}

/**
 * Remove every value that matches a known credential pattern. Returns the
 * text and how many values were removed, because both the issue and the
 * caller are told the count.
 */
export function redact(raw: string): Redaction {
  const counter = { n: 0 };
  let text = raw;
  for (const rule of RULES) {
    text = applyOutsidePlaceholders(text, rule, counter);
  }
  return { text, count: counter.n };
}
