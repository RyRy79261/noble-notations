/**
 * The connector's readable documents.
 *
 * A tool is something a model DOES. A resource is something a model READS,
 * and a client offers it as a document to load rather than as an action to
 * take. The writing rule is the second kind: it is not a step in a workflow,
 * it is the standard every word a caller writes is held to, and an agent
 * should be able to pull it in once and keep it in context for the whole
 * session.
 *
 * ── WHY THE TEXT IS IN TypeScript AND NOT READ FROM `.claude/` ────────────
 *
 * `.claude/skills/writing-style/SKILL.md` states the same rule for a person
 * working in the repository, and it is the file a human edits. This module
 * does NOT read it. Two reasons, and the first one is decisive:
 *
 *   1. This code runs in a Vercel function. Next traces the files a route
 *      needs from its imports, and a path built at runtime traces nothing —
 *      `.claude/` would simply not be in the bundle, and the resource would
 *      fail in production while passing every local test. A file the
 *      connector must always be able to serve cannot depend on that.
 *   2. The two audiences differ. The skill tells a person which files to
 *      change and where the decision is recorded; the connector tells a
 *      model how to write the text it is about to submit. The rules are the
 *      same and the framing is not.
 *
 * So there are two copies on purpose, and `e2e/writing-style.spec.ts` fails
 * when one states a rule the other does not. That test is the contract; this
 * comment is not.
 *
 * ── SCOPE ────────────────────────────────────────────────────────────────
 *
 * Reading is behind `noble-notations:read`, the same scope every read tool
 * needs. A connector with no scope at all never reaches this code: the
 * bearer token is checked by `withMcpAuth` before the request is routed.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { agentGuide } from '@/lib/mcp/guide';
import { hasScope, READ_SCOPE } from '@/lib/mcp/scopes';

/** The one document this connector serves. */
export const WRITING_STYLE_URI = 'noble-notations://writing-style';

/**
 * The writing rule as a document, not as a field of the guide.
 *
 * `get_started` returns `howToWrite` inside a larger object, which is the
 * right shape for an agent reading the whole guide and the wrong shape for
 * one that wants the rule alone. The words are the same words; this adds a
 * title and the two sentences that say who the reader is, because a document
 * pulled in on its own has no surrounding guide to carry that.
 */
export function writingStyleDocument(): string {
  return [
    '# How to write for Noble Notations',
    '',
    agentGuide().howToWrite,
    '',
    'This rule is not enforced by a schema, because no schema can tell good',
    'prose from bad. It is stated here, in the server instructions, in',
    'get_started, and on every write tool that stores prose that a reader',
    'sees.',
  ].join('\n');
}

export function registerResources(server: McpServer): void {
  server.registerResource(
    'writing-style',
    WRITING_STYLE_URI,
    {
      title: 'How to write for Noble Notations',
      description:
        'The writing rule for every word a reader sees: ASD Simplified ' +
        'Technical English. Short sentences, one idea in each, active ' +
        'voice, the same word for the same thing, and a number and a unit ' +
        'for every amount. Read this before you write a recipe, a step, a ' +
        'note or a rationale.',
      mimeType: 'text/markdown',
    },
    (uri, extra) => {
      /*
       * The scope check is here rather than in a wrapper because a resource
       * read is not a tool call: it does not go through `runTool`, it writes
       * no audit row, and its failure shape is a thrown error rather than
       * the `isError` content block a tool returns. Reading a document that
       * states a writing rule discloses nothing about the archive, so the
       * read scope is the whole of the gate.
       */
      const info = (extra as { authInfo?: AuthInfo }).authInfo;
      const scope = (info?.extra as { scope?: string } | undefined)?.scope;
      if (!scope || !hasScope(scope, READ_SCOPE)) {
        throw new Error(
          'This connector was not granted read access. Reconnect and ' +
            'approve read access to load this document.',
        );
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/markdown',
            text: writingStyleDocument(),
          },
        ],
      };
    },
  );
}
