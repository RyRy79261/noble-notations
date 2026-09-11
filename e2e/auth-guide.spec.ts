import { test, expect } from '@playwright/test';
import { mcpClient, tokens, type AdvertisedTool } from './helpers';

/**
 * What a connector is told, and what it is then allowed to do.
 *
 * Two things reach a model before any of this repository's rules can be
 * enforced on it: the `instructions` string on the `initialize` result, and
 * the guide behind `get_started`. AGENTS.md says they live in one file "so
 * they cannot drift" — but nothing checked that either of them agrees with
 * the registry, the schemas or the scope rules underneath. `serverInstructions()`
 * had no assertion at all, and eleven of the guide's sixteen sections had
 * none.
 *
 * The tests here are not about wording. They are about the three ways this
 * text can lie to an agent:
 *
 *   1. It names a tool that `tools/list` does not carry, and the agent meets
 *      a tool-not-found error at the moment it most needs to be believed.
 *   2. It names a value — a note kind, a category type, a report kind — that
 *      the schema then refuses, so a call written from the guide is refused.
 *   3. It says which tools need which scope, and the server disagrees.
 *
 * The scope sweep at the bottom is the other half of that last one, and it
 * stands on its own: EVERY write tool is refused to a read-only token, and no
 * read tool is. `report_issue` is in neither scope on purpose, and that is
 * asserted here rather than assumed.
 */

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3100}`;

function agent(token = tokens().readWrite) {
  return mcpClient(BASE, token);
}

/**
 * The `instructions` field of an `initialize` result.
 *
 * Read raw: `mcpClient` starts its session and throws that body away, and
 * this string is the whole subject.
 */
async function serverInstructions(): Promise<string> {
  const response = await fetch(`${BASE}/api/mcp/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${tokens().readWrite}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'noble-notations-e2e', version: '0' },
      },
    }),
  });
  const text = await response.text();
  const line = text
    .trim()
    .split('\n')
    .find((candidate) => candidate.startsWith('data:'));
  const payload = JSON.parse(line ? line.slice(5).trim() : text) as {
    result?: { instructions?: string };
  };
  const instructions = payload.result?.instructions;
  expect(instructions, `no instructions on initialize:\n${text}`).toBeTruthy();
  return instructions!;
}

/** One enum, as the advertised JSON Schema carries it. */
function enumOf(tool: AdvertisedTool, field: string): string[] {
  const schema = tool.inputSchema as
    { properties?: Record<string, { enum?: string[] }> } | undefined;
  const values = schema?.properties?.[field]?.enum;
  expect(values, `${tool.name}.${field} advertises no enum`).toBeTruthy();
  return values!;
}

// ─────────────────────────────────────────────────────────────────────────
// 1. The instructions — the first thing a client reads
// ─────────────────────────────────────────────────────────────────────────

test('the instructions state the rule the whole repository is built on', async () => {
  // A model that does not know this store keeps versions will call
  // create_recipe where it must call revise_recipe, and the second recipe
  // for one dish is the exact failure this project exists to stop. That
  // sentence has to be in the text a client reads BEFORE its first tool
  // call, not only in the guide behind a tool it may never call.
  const instructions = await serverInstructions();

  expect(instructions).toContain('revise_recipe');
  expect(instructions).toMatch(/cannot change a version/i);
  expect(instructions).toMatch(/cannot delete/i);
  // The two write paths that are easy to confuse with editing, and the two
  // fill-once tools, are named where an agent will see them.
  expect(instructions).toContain('backfill_revision');
  expect(instructions).toContain('add_mass_flow');
  expect(instructions).toContain('describe_mechanism');
  // And the instruction that makes the read tools worth having.
  expect(instructions).toContain('search_recipes');
  expect(instructions).toContain('get_started');
});

test('the guide and the instructions name only tools that exist', async () => {
  // THE FAILURE THIS CATCHES is a guide that teaches a tool the registry
  // does not carry. It has happened in this repository before in the other
  // direction — `backfill_revision` was added and the guide's count of write
  // tools was not — and the cost is specific: an agent that follows the text
  // meets a tool-not-found error and cannot tell whether it was wrong or the
  // server is broken.
  //
  // Everything that looks like a tool name is matched, and anything left
  // over after the registry has been subtracted must be in the small list
  // below. That list is vocabulary this project uses that happens to be
  // spelled the same way — a category type and three example metric names.
  // Adding to it is meant to be a deliberate act, because the alternative is
  // a check that matches nothing.
  const NOT_TOOLS = new Set([
    'ingredient_class',
    'initial_weight',
    'final_weight',
    'days_to_cut',
  ]);

  const mcp = agent();
  const advertised = await mcp.listToolSchemas();
  const registry = new Set(advertised.map((tool) => tool.name));
  const guide = await mcp.call<Record<string, unknown>>('get_started', {});

  const sources: [string, string][] = [
    ['the server instructions', await serverInstructions()],
    ['get_started', JSON.stringify(guide)],
    ...advertised.map((tool): [string, string] => [
      `the description of ${tool.name}`,
      tool.description ?? '',
    ]),
  ];

  for (const [where, text] of sources) {
    const looksLikeATool = new Set(
      text.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g) ?? [],
    );
    const unknown = [...looksLikeATool].filter(
      (name) => !registry.has(name) && !NOT_TOOLS.has(name),
    );
    expect(unknown, `${where} names something that is not a tool`).toEqual([]);
  }
});

// ─────────────────────────────────────────────────────────────────────────
// 2. The guide agrees with the schemas
// ─────────────────────────────────────────────────────────────────────────

test('every section of the guide is present and says something', async () => {
  // The guide is one object and a client reads all of it. A section that
  // became an empty string, or lost its key in a refactor, disappears in
  // silence — and the sections most likely to go are the ones no other test
  // touches, which until now was eleven of the sixteen.
  const guide = await agent().call<Record<string, unknown>>('get_started', {});

  const SECTIONS = [
    'whatThisIs',
    'theOneRule',
    'olderVersions',
    'workflow',
    'noteKinds',
    'categories',
    'ingredients',
    'mechanismConditions',
    'massFlow',
    'images',
    'shoppingList',
    'scopes',
    'reportingAFault',
    'rules',
    'units',
    'afterYouWrite',
  ];

  for (const section of SECTIONS) {
    const value = guide[section];
    expect(value, `${section} is missing from the guide`).toBeTruthy();
    if (typeof value === 'string') {
      expect(value.length, `${section} is empty`).toBeGreaterThan(40);
    } else if (Array.isArray(value)) {
      expect(value.length, `${section} is empty`).toBeGreaterThan(0);
      for (const entry of value)
        expect(String(entry).length).toBeGreaterThan(8);
    } else {
      expect(
        Object.keys(value as object).length,
        `${section} is empty`,
      ).toBeGreaterThan(0);
    }
  }

  // The workflow is the ordered instruction an agent follows, and its first
  // step is the one that stops a duplicate recipe being written.
  expect(String((guide.workflow as string[])[0])).toContain('search_recipes');
});

test('the note kinds the guide explains are the note kinds add_note accepts', async () => {
  // `science` and `research` are the pair that gets confused, and the guide
  // is where the split is explained. A kind explained here but refused by
  // the schema sends an agent to a validation error; a kind the schema
  // accepts but the guide does not explain gets used for the wrong thing.
  const mcp = agent();
  const addNote = (await mcp.listToolSchemas()).find(
    (tool) => tool.name === 'add_note',
  );
  expect(addNote).toBeTruthy();
  const guide = await mcp.call<{ noteKinds: Record<string, string> }>(
    'get_started',
    {},
  );

  expect(Object.keys(guide.noteKinds).sort()).toEqual(
    enumOf(addNote!, 'kind').sort(),
  );
  // And the two that are confused are told apart, in the words the
  // repository uses for them.
  expect(guide.noteKinds.science).toMatch(/happens in the dish/i);
  expect(guide.noteKinds.research).toMatch(/after you made it/i);
});

test('the category types the guide lists are the ones upsert_category accepts', async () => {
  const mcp = agent();
  const upsertCategory = (await mcp.listToolSchemas()).find(
    (tool) => tool.name === 'upsert_category',
  );
  expect(upsertCategory).toBeTruthy();
  const guide = await mcp.call<{ categories: string }>('get_started', {});

  const types = enumOf(upsertCategory!, 'categoryType');
  expect(types.length).toBeGreaterThan(1);
  for (const type of types) {
    expect(guide.categories, `the guide does not name ${type}`).toContain(type);
  }
  // The word this vocabulary dropped must not come back through the guide.
  expect(guide.categories.toLowerCase()).not.toContain('taxonomy');
  expect(guide.categories.toLowerCase()).not.toContain('facet');
});

test('the report kinds the guide describes are the ones report_issue accepts', async () => {
  const mcp = agent();
  const reportIssue = (await mcp.listToolSchemas()).find(
    (tool) => tool.name === 'report_issue',
  );
  expect(
    reportIssue,
    'report_issue is not registered; the suite sets GITHUB_ISSUE_TOKEN',
  ).toBeTruthy();
  const guide = await mcp.call<{ reportingAFault: string }>('get_started', {});

  for (const kind of enumOf(reportIssue!, 'kind')) {
    expect(
      guide.reportingAFault,
      `the guide does not name the kind ${kind}`,
    ).toContain(kind);
  }
  // The rule JSON Schema cannot carry, stated in the place an agent reads
  // when it is about to file: a bug needs all three pieces of evidence.
  expect(guide.reportingAFault).toContain('toolName');
  expect(guide.reportingAFault).toContain('payload');
  expect(guide.reportingAFault).toContain('response');
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Scope, on every tool, and the sentence in the guide that describes it
// ─────────────────────────────────────────────────────────────────────────

/**
 * One shape-valid call per tool.
 *
 * The arguments matter in two ways. They have to pass the advertised JSON
 * Schema, because the transport validates against it before any handler runs
 * — a call refused for its shape never reaches the scope check and would
 * prove nothing. And every write entry has to be refused for a SECOND reason
 * once the scope check is past, so this sweep writes nothing to the database
 * even when it is run against a build whose scope check has been taken out.
 */
const GHOST = 'no-such-recipe-for-the-scope-sweep';

const CALLS: Record<string, Record<string, unknown>> = {
  // Reads.
  get_started: {},
  search_recipes: { query: 'biltong' },
  get_recipe: { slug: 'baumy-biltong' },
  list_categories: {},
  list_ingredients: {},
  get_ingredient: { slug: 'bay-leaf' },
  list_experiments: {},
  get_experiment: { slug: 'biltong-batch-3' },
  build_shopping_list: { slugs: ['baumy-biltong'] },
  get_repository_stats: {},

  // Neither scope.
  report_issue: {
    title: 'a scope sweep that deliberately carries no evidence',
    body:
      'This call exists to prove report_issue is not behind a scope. It is ' +
      'refused for its shape, so nothing is filed anywhere.',
    kind: 'bug',
  },

  // Writes. Each is refused a second time after the scope check.
  create_recipe: { title: 'A scope sweep', slug: 'baumy-biltong' },
  revise_recipe: { slug: GHOST, rationale: 'A sweep that must not write.' },
  backfill_revision: {
    slug: GHOST,
    occurredAt: '1999-01-01',
    rationale: 'A sweep that must not write.',
  },
  add_note: {
    kind: 'observation',
    body: 'A sweep that names no target, so it is refused for that.',
  },
  add_mass_flow: {
    slug: GHOST,
    stages: [
      { label: 'Raw', quantity: 1000, unit: 'g' },
      { label: 'Dried', quantity: 450, unit: 'g' },
    ],
  },
  describe_mechanism: {
    noteId: '00000000-0000-0000-0000-000000000000',
    conditions: ['1 °C'],
  },
  upsert_ingredient: { name: 'Bay leaf', slug: 'black-pepper' },
  upsert_category: {
    categoryType: 'technique',
    label: 'A scope sweep',
    parentSlug: 'no-such-parent-for-the-scope-sweep',
  },
  log_experiment: { title: 'A scope sweep', revisionNumber: 1 },
};

const WRITE_TOOLS = [
  'create_recipe',
  'revise_recipe',
  'backfill_revision',
  'add_note',
  'add_mass_flow',
  'describe_mechanism',
  'upsert_ingredient',
  'upsert_category',
  'log_experiment',
];

/** English for a count, because the guide writes the number in words. */
const IN_WORDS: Record<number, string> = {
  7: 'seven',
  8: 'eight',
  9: 'nine',
  10: 'ten',
  11: 'eleven',
  12: 'twelve',
};

test('a read-only token is refused every write tool and no other', async () => {
  test.setTimeout(60_000);

  // The whole registry, one call each, with a token whose scope is read.
  // Testing a sample would miss the tool somebody adds without `requireWrite`
  // — which is the only way this can break, since the check is one line
  // repeated per tool rather than something applied centrally.
  const mcp = agent(tokens().readOnly);
  const registry = (await mcp.listTools()).sort();
  // A tool added without an entry here is a tool this sweep would skip in
  // silence, so the table has to be complete before anything is asserted.
  expect(Object.keys(CALLS).sort()).toEqual(registry);

  const refusedForScope: string[] = [];
  for (const [tool, args] of Object.entries(CALLS)) {
    let message = '';
    try {
      await mcp.call(tool, args);
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    if (/read-only access/i.test(message)) refusedForScope.push(tool);
  }

  expect(refusedForScope.sort()).toEqual([...WRITE_TOOLS].sort());

  // The reads are not merely un-refused, they answer — otherwise a server
  // that had broken every tool would pass the assertion above.
  const recipe = await mcp.call<{ slug: string }>('get_recipe', {
    slug: 'baumy-biltong',
  });
  expect(recipe.slug).toBe('baumy-biltong');
});

test('the guide counts the write tools the server actually gates', async () => {
  // The count in this sentence has been wrong before: it said "six" while
  // the registry held seven, because `backfill_revision` was added and the
  // line was not. An agent that reads a number and counts a different one
  // has no way to tell which of the two to trust, so the number is tied to
  // the measurement.
  const guide = await agent().call<{ scopes: string }>('get_started', {});

  const word = IN_WORDS[WRITE_TOOLS.length];
  expect(word, `no English word for ${WRITE_TOOLS.length}`).toBeTruthy();
  expect(guide.scopes).toContain(`The ${word} write tools`);
  expect(guide.scopes).toContain('noble-notations:read');
  expect(guide.scopes).toContain('noble-notations:write');

  // And the one tool that is in neither scope is named as such, because a
  // reader who assumes it is behind write would never file a report from a
  // read-only connector — which is the connector that meets read-tool bugs.
  expect(guide.scopes).toContain('report_issue needs no extra scope');
});
