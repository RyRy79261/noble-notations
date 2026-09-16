import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { mcpClient, tokens } from './helpers';

/**
 * THE WRITING RULE IS STATED TWICE, AND THIS IS WHAT KEEPS THE TWO HONEST.
 *
 * `.claude/skills/writing-style/SKILL.md` is the copy a person working in
 * this repository reads, and the copy Claude Code loads as a skill.
 * `howToWrite` in `src/lib/mcp/guide.ts` is the copy the connector serves —
 * inside `get_started`, and on its own as the resource
 * `noble-notations://writing-style`.
 *
 * Two copies is a deliberate choice and `src/lib/mcp/resources.ts` gives the
 * reason at length: the connector runs in a Vercel function, Next traces the
 * files a route needs from its imports, and a path built at runtime traces
 * nothing — `.claude/` would not be in the bundle, so a connector that read
 * the skill file would fail in production and pass every local test.
 *
 * The cost of two copies is drift, and drift here is the worst kind: the
 * person and the model would be held to different standards while both
 * believed they were following the house rule. So the rules are enumerated
 * below and each one is asserted in BOTH copies. A rule added to one and not
 * the other fails here, naming itself.
 *
 * It asserts RULES, not wording. The two copies are written for different
 * readers — one says which files to change, the other tells a model how to
 * write the text it is about to submit — so an assertion on shared sentences
 * would either be vacuous or would forbid the framing each reader needs.
 */

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3100}`;
const WRITING_STYLE_URI = 'noble-notations://writing-style';

const SKILL_PATH = path.join(
  process.cwd(),
  '.claude',
  'skills',
  'writing-style',
  'SKILL.md',
);

function skillFile(): string {
  return readFileSync(SKILL_PATH, 'utf8');
}

/**
 * The rules both copies must state.
 *
 * Each entry is one rule and the two patterns that find it. They differ
 * because the two copies address different readers; they are both anchored
 * on the load-bearing words, which is the part that cannot change without
 * changing the rule.
 */
const RULES: { rule: string; skill: RegExp; served: RegExp }[] = [
  {
    rule: 'the style has a name',
    skill: /ASD Simplified Technical English/i,
    served: /ASD Simplified Technical English/i,
  },
  {
    rule: 'short sentences',
    skill: /short sentences/i,
    served: /short sentences/i,
  },
  {
    rule: 'a step is 20 words or fewer',
    skill: /20 words or fewer/i,
    served: /20 words or fewer/i,
  },
  {
    rule: 'one idea in each sentence',
    skill: /one idea in each sentence/i,
    served: /one idea in each sentence/i,
  },
  {
    rule: 'the active voice',
    skill: /active voice/i,
    served: /active voice/i,
  },
  {
    rule: 'the same word for the same thing',
    skill: /same word for the same thing/i,
    served: /same word for the same thing/i,
  },
  {
    rule: 'a number and a unit for every amount',
    skill: /number and a unit/i,
    served: /number and a unit/i,
  },
  {
    rule: 'no metaphor, no joke, no praise',
    skill: /metaphor/i,
    served: /metaphor/i,
  },
  {
    rule: 'a cook reads this, and often not in a first language',
    skill: /first language/i,
    served: /first language/i,
  },
  {
    rule: 'a quotation is copied exactly',
    skill: /quotation/i,
    served: /quotation/i,
  },
];

test('the skill file is a skill', () => {
  // A SKILL.md with no frontmatter, or with no description, is a Markdown
  // file that nothing ever loads. The description is what decides whether
  // the skill triggers at all, so an empty one is the same failure as an
  // absent file and is caught here rather than by nobody.
  const text = skillFile();
  const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(text);
  expect(frontmatter, 'SKILL.md has no frontmatter block').toBeTruthy();

  const block = frontmatter![1]!;
  expect(block, 'the skill does not name itself').toMatch(
    /^name:\s*writing-style\s*$/m,
  );
  const description = /^description:\s*(.+)$/m.exec(block);
  expect(description, 'the skill has no description').toBeTruthy();
  expect(
    description![1]!.trim().length,
    'the description is too short to trigger on',
  ).toBeGreaterThan(40);
});

test('the connector serves the writing rule as a readable document', async () => {
  const mcp = mcpClient(BASE, tokens().readOnly);

  // Advertised, or no client will ever offer it. A resource that exists and
  // is not in `resources/list` is a resource only a caller who already knew
  // its URI can find, which is nobody.
  const resources = await mcp.listResources();
  const doc = resources.find((r) => r.uri === WRITING_STYLE_URI);
  expect(
    doc,
    `${WRITING_STYLE_URI} is not in resources/list: ` +
      JSON.stringify(resources.map((r) => r.uri)),
  ).toBeTruthy();
  expect(doc!.mimeType).toBe('text/markdown');
  expect(
    doc!.description ?? '',
    'the document does not say what it is',
  ).toMatch(/writing rule/i);

  // READ SCOPE, NOT WRITE. This is the token that is refused every write
  // tool, and it must be able to load the rule: the agent that most needs
  // the house style is the one about to be granted write access, and it
  // reads the document before that happens.
  const text = await mcp.readResource(WRITING_STYLE_URI);
  expect(text.length, 'the document came back empty').toBeGreaterThan(400);
  expect(text).toMatch(/^# How to write for Noble Notations/m);
});

test('the skill and the connector state the same writing rule', async () => {
  const mcp = mcpClient(BASE, tokens().readOnly);
  const served = await mcp.readResource(WRITING_STYLE_URI);
  const skill = skillFile();

  const missing: string[] = [];
  for (const { rule, skill: inSkill, served: inServed } of RULES) {
    if (!inSkill.test(skill)) missing.push(`SKILL.md does not state: ${rule}`);
    if (!inServed.test(served)) {
      missing.push(`the connector does not state: ${rule}`);
    }
  }

  expect(
    missing,
    'the two copies of the writing rule have drifted. Both ' +
      '.claude/skills/writing-style/SKILL.md and howToWrite in ' +
      'src/lib/mcp/guide.ts state this rule, and they change together.',
  ).toEqual([]);
});

test('the document and get_started carry the same rule', async () => {
  // The resource is not a second rule with the same name. It is `howToWrite`
  // with a title on it, so an agent that loaded the document and an agent
  // that called `get_started` are holding the same text.
  const mcp = mcpClient(BASE, tokens().readOnly);
  const served = await mcp.readResource(WRITING_STYLE_URI);
  const guide = await mcp.call<{ howToWrite: string }>('get_started', {});

  expect(served).toContain(guide.howToWrite);
});
