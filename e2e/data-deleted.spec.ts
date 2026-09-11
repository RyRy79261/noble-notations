import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mcpClient, tokens, type McpClient } from './helpers';
import {
  BEGIN,
  BIN,
  END,
  KEEP,
  NO_SENTINEL_POSSIBLE,
  type CensusFixture,
  type CensusReport,
} from './deleted-census-contract';

/**
 * ─────────────────────────────────────────────────────────────────────────
 * THE LEAK HUNT. A deleted record must be absent from EVERY public surface.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * This is the failure the whole soft-delete branch risks, and it is worth
 * saying precisely. A hard delete cannot leak: the row is gone, and a query
 * that forgot to filter returns nothing because there is nothing. A SOFT
 * delete leaves the row in place and moves the burden onto every read. So
 * the defect this file hunts is not "the delete did not work" — it is "the
 * delete worked and one of forty reads never heard about it", which shows
 * up as a recipe somebody deleted still sitting on the sitemap, in
 * `/llms.txt`, in the markdown export or behind a search box.
 *
 * The fixture writes one of every record with `ZZBIN` in every field that
 * can render, deletes them, and then goes looking:
 *
 *   1. **The census** — every exported function in `src/lib/queries/read.ts`,
 *      by enumeration rather than by hand. See `e2e/deleted-census.ts`.
 *   2. **Every route `pnpm audit:ui` drives**, plus the six the audit does
 *      not: `/llms.txt`, `/sitemap.xml`, the `.md` view, the deleted detail
 *      addresses and the shopping list.
 *   3. **The markdown export**, which is the offline copy of everything.
 *   4. **Every MCP read tool**, over the real wire.
 *   5. **`get_repository_stats`**, which returns six integers and is
 *      therefore the one read no sentinel can reach.
 *
 * WHY THERE IS A SECOND SENTINEL. `ZZKEEP` marks records that stay. Every
 * assertion below is satisfied by a site that returns nothing at all, so
 * each surface is also required to carry the live record. Without that, a
 * `read.ts` where every function threw would pass this file perfectly.
 *
 * THE FIXTURE IS BUILT OVER THE MCP WIRE with the real tools, so the delete
 * path is exercised by the test that checks it rather than by a helper that
 * writes the column itself.
 */

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3100}`;
const ROOT = process.cwd();
const TSX = path.join(ROOT, 'node_modules', '.bin', 'tsx');
const TSCONFIG = path.join(ROOT, 'tsconfig.json');
const CENSUS = path.join(ROOT, 'e2e', 'deleted-census.ts');
const EXPORTER = path.join(ROOT, 'scripts', 'export-markdown.ts');

function rw(): McpClient {
  return mcpClient(BASE, tokens().readWrite);
}

interface NoteResult {
  noteId: string;
}
interface DeleteResult {
  kind: string;
  handle: string;
  eventId: string;
  cascaded: { kind: string; count: number }[];
  message: string;
}
interface Stats {
  recipes: number;
  revisions: number;
  ingredients: number;
  terms: number;
  notes: number;
  experiments: number;
}

/**
 * What the fixture wrote. Filled by `beforeAll` and read by every test.
 *
 * The names carry a per-run stamp because a serial describe is RETRIED from
 * its `beforeAll`, and `create_recipe` on a slug that a deleted recipe holds
 * is refused by design. A fixed slug would make the retry fail for a reason
 * that has nothing to do with the test under it.
 */
let fixture: CensusFixture;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  const mcp = rw();
  const stamp = Date.now().toString(36);

  const binRecipe = `zzbin-recipe-${stamp}`;
  const keepRecipe = `zzkeep-recipe-${stamp}`;
  const binRun = `zzbin-run-${stamp}`;
  const keepRun = `zzkeep-run-${stamp}`;
  const binIngredient = `zzbin-allspice-${stamp}`;
  const keepIngredient = `zzkeep-flour-${stamp}`;
  const binTag = `zzbin-curing-${stamp}`;
  const keepTag = `zzkeep-roasting-${stamp}`;
  const binTagLabel = `${BIN} curing ${stamp}`;
  const binIngredientName = `${BIN} allspice ${stamp}`;

  fixture = {
    binRecipe,
    keepRecipe,
    binRun,
    keepRun,
    binIngredient,
    keepIngredient,
    binTag,
    keepTag,
    binTagLabel,
    binIngredientName,
    // The sentinel AND the slugs. A slug is lower case by regular
    // expression, so it cannot carry an upper-case sentinel — and
    // `listRecipeSlugs`, the sitemap and `pnpm export` deal in slugs alone.
    forbidden: [BIN, binRecipe, binRun, binIngredient, binTag],
    keepMarkers: [KEEP, keepRecipe],
  };

  // ── Two tags and two ingredients, described, so both read the same way.
  await mcp.call('upsert_category', {
    categoryType: 'technique',
    label: binTagLabel,
    slug: binTag,
    description: `${BIN} a technique that is about to go in the bin.`,
  });
  await mcp.call('upsert_category', {
    categoryType: 'technique',
    label: `${KEEP} roasting ${stamp}`,
    slug: keepTag,
    description: `${KEEP} a technique that stays.`,
  });
  await mcp.call('upsert_ingredient', {
    name: binIngredientName,
    slug: binIngredient,
    category: 'spice',
    description: `${BIN} an ingredient that is about to go in the bin.`,
  });
  await mcp.call('upsert_ingredient', {
    name: `${KEEP} flour ${stamp}`,
    slug: keepIngredient,
    category: 'grain',
    description: `${KEEP} an ingredient that stays.`,
  });

  // ── The doomed recipe. Every field that renders carries the sentinel.
  await mcp.call('create_recipe', {
    title: `${BIN} doomed dish`,
    slug: binRecipe,
    subtitle: `${BIN} subtitle`,
    summary: `${BIN} summary of a dish that two chats wrote twice.`,
    rationale: `${BIN} rationale for the first version.`,
    originNote: `${BIN} origin note.`,
    categories: { technique: [binTagLabel, `${KEEP} roasting ${stamp}`] },
    ingredients: [
      { name: `${KEEP} flour ${stamp}`, quantity: 300, unit: 'g' },
      { name: binIngredientName, quantity: 4, unit: 'g' },
    ],
    steps: [{ instruction: `Cure the ${BIN} thing for one day.` }],
  });
  await mcp.call('revise_recipe', {
    slug: binRecipe,
    rationale: `${BIN} rationale for the second version.`,
  });
  const binNote = await mcp.call<NoteResult>('add_note', {
    recipeSlug: binRecipe,
    kind: 'science',
    title: `${BIN} mechanism`,
    body: `${BIN} body of a mechanism nobody will read.`,
  });
  await mcp.call('describe_mechanism', {
    noteId: binNote.noteId,
    conditions: [`${BIN} 5 °C`],
  });
  await mcp.call('log_experiment', {
    slug: binRun,
    title: `${BIN} batch`,
    recipeSlug: binRecipe,
    revisionNumber: 1,
    outcome: `${BIN} outcome of a run that goes with its recipe.`,
    items: [{ label: `${BIN} strip` }],
    observations: [{ metric: 'initial_weight', value: 1000, unit: 'g' }],
  });
  await mcp.call('add_note', {
    experimentSlug: binRun,
    kind: 'observation',
    body: `${BIN} note on the run.`,
  });

  // ── The recipe that STAYS, and points at the doomed one four ways: a
  // link, an ingredient line, a shared tag and a note of its own. Each is a
  // separate place a deleted row could surface on a live page.
  await mcp.call('create_recipe', {
    title: `${KEEP} kept dish`,
    slug: keepRecipe,
    summary: `${KEEP} summary of the dish that stays.`,
    rationale: `${KEEP} rationale.`,
    categories: { technique: [binTagLabel, `${KEEP} roasting ${stamp}`] },
    links: [{ kind: 'variant_of', slug: binRecipe, note: `${BIN} link note.` }],
    ingredients: [
      { name: `${KEEP} flour ${stamp}`, quantity: 200, unit: 'g' },
      {
        name: binIngredientName,
        quantity: 2,
        unit: 'g',
        // The rendered line is written by hand so it carries NO sentinel.
        // An ingredient line whose canonical ingredient was deleted keeps
        // its own text — the recipe is still cookable, which is the point of
        // not cascading a delete into the lines that named it. That text
        // being present is correct; the INGREDIENT RECORD appearing is not,
        // and only a hand-written rawText can tell those two apart.
        rawText: 'Two grams of the spice that goes',
      },
    ],
    steps: [{ instruction: `Roast the ${KEEP} thing.` }],
  });
  await mcp.call('add_note', {
    recipeSlug: keepRecipe,
    kind: 'science',
    title: `${KEEP} mechanism`,
    body: `${KEEP} body of a mechanism that stays.`,
  });
  const stray = await mcp.call<NoteResult>('add_note', {
    recipeSlug: keepRecipe,
    kind: 'science',
    title: `${BIN} stray mechanism`,
    body: `${BIN} body of a note deleted on its own, on a live recipe.`,
  });
  await mcp.call('log_experiment', {
    slug: keepRun,
    title: `${KEEP} batch`,
    recipeSlug: keepRecipe,
    revisionNumber: 1,
    outcome: `${KEEP} outcome.`,
  });

  // ── Now delete. Four calls: one cascade and three leaves.
  const cascade = await mcp.call<DeleteResult>('delete_record', {
    kind: 'recipe',
    slug: binRecipe,
    reason: `${BIN} a duplicate that two chats wrote twice.`,
  });
  // The cascade is asserted here rather than in a test of its own because
  // every assertion below depends on it: a delete that took the recipe and
  // left the run would make the route sweep fail for the wrong reason.
  expect(
    Object.fromEntries(cascade.cascaded.map((c) => [c.kind, c.count])),
    'the recipe took its versions, its notes and its run',
  ).toEqual({ revision: 2, note: 2, experiment: 1 });

  await mcp.call('delete_record', {
    kind: 'note',
    id: stray.noteId,
    reason: `${BIN} a stray note on a recipe that stays.`,
  });
  await mcp.call('delete_record', {
    kind: 'ingredient',
    slug: binIngredient,
    reason: `${BIN} an ingredient nobody uses.`,
  });
  await mcp.call('delete_record', {
    kind: 'tag',
    slug: binTag,
    categoryType: 'technique',
    reason: `${BIN} a tag that does not group anything.`,
  });
});

/** Every forbidden string this text carries, so a failure names which. */
function leaks(text: string): string[] {
  return fixture.forbidden.filter((needle) => text.includes(needle));
}

// ─────────────────────────────────────────────────────────────────────────
// 1. The census — every exported read, by enumeration
// ─────────────────────────────────────────────────────────────────────────

test('every exported read is in the census table, and none of them returns a deleted record', async () => {
  test.slow();

  const stdout = execFileSync(TSX, ['--tsconfig', TSCONFIG, CENSUS], {
    encoding: 'utf8',
    stdio: 'pipe',
    env: {
      ...process.env,
      // `read.ts` imports `server-only`, which resolves to a throwing client
      // entry outside Next. Same escape `e2e/data-archive.spec.ts` uses.
      NODE_OPTIONS: '--conditions=react-server',
      CENSUS_FIXTURE: JSON.stringify(fixture),
    },
  });

  const body = stdout.slice(
    stdout.indexOf(BEGIN) + BEGIN.length,
    stdout.indexOf(END),
  );
  expect(
    body.trim().length,
    `the census printed no report:\n${stdout.slice(-2000)}`,
  ).toBeGreaterThan(0);
  const report = JSON.parse(body) as CensusReport;

  // THE PROPERTY THIS FILE EXISTS FOR. A sixteenth exported read that
  // nobody added to the table fails here, on the day it lands, naming
  // itself — and a table entry for a function that was removed fails the
  // same way. A list of fifteen hand-written assertions cannot do either.
  expect(
    report.missing,
    'read.ts exports a function the census does not call. Add it to CALLS ' +
      'in e2e/deleted-census.ts, with arguments that would surface a ' +
      'deleted record.',
  ).toEqual([]);
  expect(
    report.extra,
    'the census calls something read.ts no longer exports',
  ).toEqual([]);

  // A call that threw is a call that proved nothing, and the two counts
  // below would both be zero for it.
  expect(
    report.results.filter((r) => r.error).map((r) => `${r.name}: ${r.error}`),
  ).toEqual([]);

  // The leak hunt itself, one line per call so the failure names the call.
  expect(
    report.results
      .filter((r) => Object.keys(r.found).length > 0)
      .map((r) => `${r.name} (${r.label}) returned ${JSON.stringify(r.found)}`),
  ).toEqual([]);

  // THE POSITIVE CONTROL, AND IT IS PER FUNCTION. Every read except
  // getStats has at least one call that addresses the record which STAYS,
  // and that call is required to have found it. Without this a read.ts
  // where every function returned [] would pass every assertion above
  // perfectly. It is per function and not per call because the other half
  // of each entry addresses the deleted record on purpose, and finding
  // nothing is exactly what that half is asserting.
  const sawLive = new Set(
    report.results.filter((r) => r.live).map((r) => r.name),
  );
  const blind = [...new Set(report.results.map((r) => r.name))].filter(
    (name) => !sawLive.has(name) && !NO_SENTINEL_POSSIBLE.includes(name),
  );
  expect(
    blind,
    'a read that returns nothing proves nothing about filtering',
  ).toEqual([]);

  // And getStats, the exempt one, still has to have answered something.
  const stats = report.results.find((r) => r.name === 'getStats')!;
  expect(stats.bytes).toBeGreaterThan(20);
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Every public route
// ─────────────────────────────────────────────────────────────────────────

/**
 * The route list `pnpm audit:ui` drives, read out of the script itself.
 *
 * Read rather than copied because the two must not drift: the audit's own
 * figure — 22 routes × 4 widths × 2 states = 176 page loads — is quoted in
 * R-ACC-11 and in `design/BUILD-PLAN.md` §5.1, and a route added there is a
 * route that must also be swept for a leak. Importing the module is not an
 * option: it calls `main()` at load and would start a browser audit inside
 * the worker.
 */
function auditRoutes(): string[] {
  const source = readFileSync(
    path.join(ROOT, 'scripts', 'audit-ui.ts'),
    'utf8',
  );
  const block = /const ROUTES = \[([\s\S]*?)\n\];/.exec(source);
  expect(
    block,
    'scripts/audit-ui.ts no longer declares ROUTES as an array literal',
  ).toBeTruthy();
  const routes = [...block![1]!.matchAll(/^\s*'([^']+)',/gm)].map((m) => m[1]!);
  expect(routes.length, 'the audit route list looks truncated').toBeGreaterThan(
    20,
  );
  return routes;
}

test('no page the audit drives carries a deleted record, and the kept one is on the index screens', async ({
  request,
}) => {
  test.slow();

  const routes = auditRoutes();
  const carriedKeep: string[] = [];

  for (const route of routes) {
    const response = await request.get(route);
    const body = await response.text();
    expect(leaks(body), `${route} carries a deleted record`).toEqual([]);
    if (body.includes(KEEP)) carriedKeep.push(route);
  }

  // Four index screens must show the live fixture, or this sweep was 22
  // requests against pages that render nothing.
  for (const route of ['/recipes', '/classes', '/ingredients', '/batch-logs']) {
    expect(
      carriedKeep,
      `${route} does not show the kept record, so the sweep proved nothing`,
    ).toContain(route);
  }
});

test('no served page still promises that nothing is deleted or edited in place', async ({
  request,
}) => {
  test.slow();

  /*
   * A TRIPWIRE FOR PAGE COPY, which is the one thing this suite had no
   * counterpart for. `e2e/auth-guide.spec.ts` keeps one over the agent
   * guide, with a comment saying "a promise about what the connector CANNOT
   * do is a claim about every tool that will ever be registered, and this
   * repository has now had one age badly twice". A page makes the same
   * promise to a reader and to a crawler, and four of them survived the
   * branch whose whole subject is that the rule changed — including the
   * lede of the Revisions band, printed directly above a timeline with
   * holes in it, and the 404 that every deleted record's address serves.
   *
   * The strings are matched case-insensitively against the rendered body of
   * every audited route plus the three machine-readable ones. A new page
   * that repeats one of them fails on the day it lands.
   */
  const broken = [
    /nothing (?:here )?is ever deleted/i,
    /never edited(?: and never removed)?/i,
    /(?:nothing|ingredients and steps are never) .{0,20}edited in place/i,
    /cannot delete/i,
  ];

  const routes = [
    ...auditRoutes(),
    '/llms.txt',
    '/cuisines/french',
    '/recipes/baumy-biltong.md',
    '/nope-there-is-no-such-page',
  ];

  for (const route of routes) {
    const body = await (await request.get(route)).text();
    for (const promise of broken) {
      expect(
        promise.test(body),
        `${route} still promises "${promise.source}"`,
      ).toBe(false);
    }
  }
});

test('the surfaces the audit does not drive carry no deleted record', async ({
  request,
}) => {
  // Each of these is read by something other than a person: a crawler, a
  // model, a shopping list, a markdown client. They are the reads nobody
  // would think to assert on, and /llms.txt and /sitemap.xml are the two
  // that publish a recipe's address to the outside world.
  const surfaces = [
    '/llms.txt',
    '/sitemap.xml',
    `/recipes/${fixture.keepRecipe}`,
    `/recipes/${fixture.keepRecipe}/md`,
    `/recipes/${fixture.keepRecipe}/revisions/1`,
    `/recipes/${fixture.keepRecipe}/batch-logs`,
    `/science/${fixture.keepRecipe}`,
    `/ingredients/${fixture.keepIngredient}`,
    `/classes/technique/${fixture.keepTag}`,
    `/batch-logs/${fixture.keepRun}`,
  ];

  for (const route of surfaces) {
    const response = await request.get(route);
    expect(response.status(), `${route} did not answer`).toBe(200);
    const body = await response.text();
    expect(leaks(body), `${route} carries a deleted record`).toEqual([]);
  }

  // The positive controls, each on the surface that matters for it. Without
  // these the sweep above is ten requests against pages that draw nothing.
  expect(await (await request.get('/llms.txt')).text()).toContain(KEEP);
  expect(await (await request.get('/sitemap.xml')).text()).toContain(
    fixture.keepRecipe,
  );
  expect(
    await (await request.get(`/recipes/${fixture.keepRecipe}/md`)).text(),
  ).toContain(KEEP);
  // The kept recipe still draws the line that named the deleted ingredient,
  // as its own text and with no link to a page that 404s. That degradation
  // is the reason an ingredient delete does not reach into the recipes that
  // named it: the recipe stays cookable.
  const kept = await (
    await request.get(`/recipes/${fixture.keepRecipe}`)
  ).text();
  expect(kept).toContain('Two grams of the spice that goes');
  expect(kept).not.toContain(`/ingredients/${fixture.binIngredient}`);
});

test('the two surfaces that echo the caller show nothing they were not given', async ({
  request,
}) => {
  // `/search?q=…` and `/list?r=…` both print what the caller asked for, so a
  // sentinel in the URL comes back in the body and a plain sweep would fail
  // on correct code. What matters on these two is narrower and sharper: no
  // RECIPE may be found.
  const searchFor = async (query: string) =>
    (await request.get(`/search?q=${encodeURIComponent(query)}`)).text();

  // Free text for the deleted tag's label finds nothing. THIS IS THE LEAK NO
  // DISPLAY TEST CATCHES ON ITS OWN: `recipes.search_vector` is a stored
  // column, its triggers fire on `recipe_terms` rather than on the tag row,
  // and nothing is drawn — so the word matched a recipe that carried a tag
  // which is nowhere on the site. Migration 0007 teaches the function to
  // skip a deleted tag and the write layer re-runs it.
  const byTag = await searchFor(fixture.binTagLabel);
  expect(byTag).not.toContain(fixture.keepRecipe);
  expect(byTag).not.toContain(fixture.binRecipe);

  // The same for the deleted ingredient's name, which is weight D.
  const byIngredient = await searchFor(fixture.binIngredientName);
  expect(byIngredient).not.toContain(fixture.keepRecipe);
  expect(byIngredient).not.toContain(fixture.binRecipe);

  // The control: the tag that stays still finds the recipe that carries it,
  // so the two assertions above are not passing because search is broken.
  expect(await searchFor(`${KEEP} kept dish`)).toContain(fixture.keepRecipe);

  // The shopping list degrades rather than breaking. The deleted recipe is
  // reported as one it could not find — the caller's own input echoed back,
  // which is right: a deleted slug and a typo are the same thing to a reader
  // and neither discloses anything — and the rest of the selection draws.
  const list = await (
    await request.get(`/list?r=${fixture.keepRecipe}&r=${fixture.binRecipe}`)
  ).text();
  expect(list).toContain(KEEP);
  expect(list).not.toContain(`${BIN} doomed dish`);
});

test("a deleted record's own address answers 404", async ({ request }) => {
  // A 404 rather than a page, because `deleted_at` means "not readable
  // anywhere". This is the whole difference from `status: 'archived'`, which
  // means "readable at its own address, off the index".
  const gone = [
    `/recipes/${fixture.binRecipe}`,
    `/recipes/${fixture.binRecipe}/md`,
    `/recipes/${fixture.binRecipe}/revisions/1`,
    `/recipes/${fixture.binRecipe}/revisions/2`,
    `/recipes/${fixture.binRecipe}/batch-logs`,
    `/science/${fixture.binRecipe}`,
    `/batch-logs/${fixture.binRun}`,
    `/recipes/${fixture.binRecipe}/batch-logs/${fixture.binRun}`,
    `/ingredients/${fixture.binIngredient}`,
    `/classes/technique/${fixture.binTag}`,
  ];
  for (const route of gone) {
    const response = await request.get(route);
    expect(response.status(), `${route} is still readable`).toBe(404);
  }

  // The mirror, so the list above is not passing because every one of those
  // addresses 404s whatever is in the database.
  const live = [
    `/recipes/${fixture.keepRecipe}`,
    `/recipes/${fixture.keepRecipe}/md`,
    `/recipes/${fixture.keepRecipe}/revisions/1`,
    `/recipes/${fixture.keepRecipe}/batch-logs`,
    `/science/${fixture.keepRecipe}`,
    `/batch-logs/${fixture.keepRun}`,
    `/ingredients/${fixture.keepIngredient}`,
    `/classes/technique/${fixture.keepTag}`,
  ];
  for (const route of live) {
    const response = await request.get(route);
    expect(response.status(), `${route} should still be readable`).toBe(200);
  }
});

// ─────────────────────────────────────────────────────────────────────────
// 3. The markdown export — the offline copy of everything
// ─────────────────────────────────────────────────────────────────────────

/** Every file under `dir`, as paths relative to it, sorted. */
function tree(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const name of readdirSync(current).sort()) {
      const full = path.join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(path.relative(dir, full));
    }
  };
  walk(dir);
  return out.sort();
}

test('the markdown export holds the kept recipe and not the deleted one', async () => {
  test.slow();

  // The exporter writes to `process.cwd()/content/generated` and deletes
  // that directory first, so it is run from a scratch directory of its own —
  // the same reason `e2e/data-archive.spec.ts` gives.
  const dir = mkdtempSync(path.join(tmpdir(), 'nn-deleted-export-'));
  try {
    execFileSync(TSX, ['--tsconfig', TSCONFIG, EXPORTER], {
      cwd: dir,
      stdio: 'pipe',
      env: { ...process.env, NODE_OPTIONS: '--conditions=react-server' },
    });
    const out = path.join(dir, 'content', 'generated');
    const files = tree(out);

    // `pnpm export` walks `listRecipeSlugs()`, which is live-only, so a
    // deleted recipe drops out of the copy. That is correct: the export
    // mirrors what the site shows, and a person who deleted a recipe on
    // purpose must not find it reappearing in a git diff.
    expect(files.filter((file) => file.includes(fixture.binRecipe))).toEqual(
      [],
    );
    expect(files).toContain(path.join(fixture.keepRecipe, 'current.md'));

    for (const file of files) {
      const text = readFileSync(path.join(out, file), 'utf8');
      expect(leaks(text), `${file} carries a deleted record`).toEqual([]);
    }

    // The positive control: the kept recipe really was exported, with its
    // content, and the README index names it.
    const current = readFileSync(
      path.join(out, fixture.keepRecipe, 'current.md'),
      'utf8',
    );
    expect(current).toContain(`${KEEP} kept dish`);
    expect(current).toContain(`Roast the ${KEEP} thing.`);
    expect(readFileSync(path.join(out, 'README.md'), 'utf8')).toContain(
      fixture.keepRecipe,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// 4. Every MCP read tool, over the wire
// ─────────────────────────────────────────────────────────────────────────

test('no read tool returns a deleted record, and list_deleted is the one that must', async () => {
  test.slow();

  const mcp = rw();

  /**
   * One call per read tool. Every tool the registry advertises as a read has
   * to be here — the assertion below compares the two sets — so a read tool
   * added later cannot slip past this sweep in silence.
   */
  const READS: {
    tool: string;
    args: Record<string, unknown>;
    /** Whether the call answers, or refuses because the record is gone. */
    outcome: 'answers' | 'refuses';
    scrub?: (result: unknown) => unknown;
  }[] = [
    { tool: 'get_started', args: {}, outcome: 'answers' },
    { tool: 'search_recipes', args: { query: BIN }, outcome: 'answers' },
    {
      tool: 'search_recipes',
      args: { query: fixture.binTagLabel },
      outcome: 'answers',
    },
    {
      tool: 'get_recipe',
      args: { slug: fixture.binRecipe },
      outcome: 'refuses',
    },
    {
      tool: 'get_recipe',
      args: { slug: fixture.keepRecipe },
      outcome: 'answers',
    },
    { tool: 'list_categories', args: {}, outcome: 'answers' },
    { tool: 'list_ingredients', args: {}, outcome: 'answers' },
    {
      tool: 'get_ingredient',
      args: { slug: fixture.binIngredient },
      outcome: 'refuses',
    },
    {
      tool: 'get_ingredient',
      args: { slug: fixture.keepIngredient },
      outcome: 'answers',
    },
    { tool: 'list_experiments', args: {}, outcome: 'answers' },
    {
      tool: 'get_experiment',
      args: { slug: fixture.binRun },
      outcome: 'refuses',
    },
    {
      tool: 'get_experiment',
      args: { slug: fixture.keepRun },
      outcome: 'answers',
    },
    {
      tool: 'build_shopping_list',
      args: { slugs: [fixture.keepRecipe, fixture.binRecipe] },
      outcome: 'answers',
      // `missing` is the caller's own input echoed back — a deleted slug
      // lands in it beside a typo, which discloses nothing. Scanning it
      // would fail this sweep on correct code.
      scrub: (result) => {
        const { missing: _echoed, ...rest } = result as { missing: unknown };
        return rest;
      },
    },
    { tool: 'get_repository_stats', args: {}, outcome: 'answers' },
  ];

  const advertised = await mcp.listToolSchemas();
  const reads = advertised
    .map((tool) => tool.name)
    .filter((name) => name.startsWith('get_') || name.startsWith('list_'))
    .concat('search_recipes', 'build_shopping_list')
    .sort();
  // `list_deleted` is a read and it is deliberately not in the table above:
  // showing deleted records is its whole job, and it is asserted on its own
  // below. Everything else has to be swept.
  expect(
    [...new Set(READS.map((r) => r.tool)), 'list_deleted'].sort(),
    'a read tool was added and this sweep does not call it',
  ).toEqual([...new Set(reads)]);

  for (const read of READS) {
    const where = `${read.tool} ${JSON.stringify(read.args)}`;
    let result: unknown;
    try {
      result = await mcp.call(read.tool, read.args);
      expect(read.outcome, `${where} answered and should have refused`).toBe(
        'answers',
      );
    } catch (error) {
      expect(read.outcome, `${where} refused: ${String(error)}`).toBe(
        'refuses',
      );
      // A refusal echoes the slug the caller sent, so its text is not
      // scanned. What matters is that the tool refused rather than served.
      continue;
    }
    const text = JSON.stringify(read.scrub ? read.scrub(result) : result);
    expect(leaks(text), `${where} returned a deleted record`).toEqual([]);
  }

  // list_deleted is the one read module that does not filter, so the bin
  // holds all four deletes with their reasons. A bin that showed nothing
  // would make every assertion above vacuous.
  const bin = await mcp.call<{
    rows: {
      kind: string;
      handle: string;
      reason: string | null;
      address: Record<string, unknown>;
      withParent: { kind: string } | null;
    }[];
    total: number;
  }>('list_deleted', { limit: 200 });

  const mine = bin.rows.filter((row) => row.handle.includes(BIN));
  expect(
    mine.map((row) => row.kind).sort(),
    'the bin does not hold what was deleted',
  ).toEqual(
    [
      'experiment',
      'ingredient',
      'note',
      'note',
      'note',
      'recipe',
      'revision',
      'revision',
      'tag',
    ].sort(),
  );
  // The reason is the only thing that tells the next reader why a record
  // went, and it is the one field the audit log cannot supply.
  expect(
    mine.filter((row) => !row.reason?.includes(BIN)),
    'a row in the bin lost its reason',
  ).toEqual([]);
});

// ─────────────────────────────────────────────────────────────────────────
// 5. get_repository_stats — six integers, and the one read a sentinel
//    cannot reach
// ─────────────────────────────────────────────────────────────────────────

test('the six counts drop when a record is deleted and come back when it is restored', async () => {
  test.slow();

  // `getStats` is six raw `COUNT(*)` subselects, so the ESLint import ban
  // cannot see them and the census cannot either: an integer carries no
  // sentinel. The only way to check it is to move each figure on purpose
  // and read the ledger back, which is the shape `e2e/screen-numbers.spec.ts`
  // uses for the same six counts on the home page.
  const mcp = rw();
  const stamp = `stats-${Date.now().toString(36)}`;
  const slug = `zz-stats-${Date.now().toString(36)}`;
  const stats = () => mcp.call<Stats>('get_repository_stats', {});

  await mcp.call('upsert_ingredient', {
    name: `Stats ledger ${stamp}`,
    slug: `${slug}-ing`,
    category: 'spice',
    description: 'Written to move one figure on the ledger.',
  });
  await mcp.call('upsert_category', {
    categoryType: 'technique',
    label: `Stats ledger ${stamp}`,
    slug: `${slug}-tag`,
    description: 'Written to move one figure on the ledger.',
  });
  await mcp.call('create_recipe', {
    title: `Stats ledger ${stamp}`,
    slug,
    rationale: 'Written to move one figure on the ledger.',
    ingredients: [{ name: `Stats ledger ${stamp}`, quantity: 1, unit: 'g' }],
    steps: [{ instruction: 'Do nothing with it.' }],
  });
  await mcp.call('revise_recipe', { slug, rationale: 'A second version.' });
  await mcp.call('add_note', {
    recipeSlug: slug,
    kind: 'observation',
    body: 'A note, so the note count moves too.',
  });
  await mcp.call('log_experiment', {
    slug: `${slug}-run`,
    title: `Stats ledger ${stamp}`,
    recipeSlug: slug,
    revisionNumber: 1,
  });

  const before = await stats();
  expect(
    before.recipes,
    'an empty ledger makes every delta below pass',
  ).toBeGreaterThan(0);

  await mcp.call('delete_record', { kind: 'recipe', slug });
  const afterRecipe = await stats();
  expect({
    recipes: before.recipes - afterRecipe.recipes,
    revisions: before.revisions - afterRecipe.revisions,
    notes: before.notes - afterRecipe.notes,
    experiments: before.experiments - afterRecipe.experiments,
    // Neither of these is a child of a recipe, so neither moves.
    ingredients: before.ingredients - afterRecipe.ingredients,
    terms: before.terms - afterRecipe.terms,
  }).toEqual({
    recipes: 1,
    revisions: 2,
    notes: 1,
    experiments: 1,
    ingredients: 0,
    terms: 0,
  });

  await mcp.call('delete_record', {
    kind: 'ingredient',
    slug: `${slug}-ing`,
  });
  await mcp.call('delete_record', {
    kind: 'tag',
    slug: `${slug}-tag`,
    categoryType: 'technique',
  });
  const afterAll = await stats();
  expect(afterRecipe.ingredients - afterAll.ingredients).toBe(1);
  expect(afterRecipe.terms - afterAll.terms).toBe(1);

  // And every figure comes back. A count that read the base table would have
  // been level all the way through and would fail the first block; a count
  // that dropped a row for good would fail this one.
  await mcp.call('restore_record', { kind: 'recipe', slug });
  await mcp.call('restore_record', { kind: 'ingredient', slug: `${slug}-ing` });
  await mcp.call('restore_record', {
    kind: 'tag',
    slug: `${slug}-tag`,
    categoryType: 'technique',
  });
  expect(await stats()).toEqual(before);
});

test('a line whose ingredient is deleted keeps the amount its own text does not state', async ({
  request,
}) => {
  const mcp = rw();
  const id = `raw${Date.now().toString(36)}`;
  const slug = `deleted-rawtext-${id}`;
  const spice = `Deleted rawtext spice ${id}`;

  await mcp.call('create_recipe', {
    title: `Deleted rawtext ${id}`,
    slug,
    rationale: 'Written by e2e/data-deleted.spec.ts.',
    ingredients: [
      // A CALLER-SUPPLIED `rawText` THAT STATES ONLY THE NAME. `rawText` is
      // public and documented as "Overrides the rendered line if the
      // original wording matters", so this is an ordinary line — and the
      // rule that a line with no canonical ingredient "draws its own text
      // and nothing else" is right only for the text the write layer
      // GENERATED, which carries the amount inside it. Gating on whether the
      // ingredient resolved dropped the measure here and lost the amount.
      { name: spice, quantity: 250, unit: 'g', rawText: spice },
      // The generated form, for the mirror: its text already starts with the
      // measure, so drawing it again would read "10 g 10 g …".
      { name: `Deleted rawtext salt ${id}`, quantity: 10, unit: 'g' },
      // And an optional line, whose generated text ends in "(optional)" —
      // the exporter used to append its own marker to that and print it
      // twice.
      {
        name: `Deleted rawtext pepper ${id}`,
        quantity: 4,
        unit: 'g',
        optional: true,
      },
    ],
    steps: [{ instruction: 'Combine.' }],
  });

  const before = await (await request.get(`/recipes/${slug}.md`)).text();
  expect(before).toContain(`- 250 g ${spice}`);

  for (const name of ['spice', 'salt', 'pepper']) {
    await mcp.call('delete_record', {
      kind: 'ingredient',
      slug: `deleted-rawtext-${name}-${id}`,
      reason: 'Deleted on purpose by e2e/data-deleted.spec.ts.',
    });
  }

  const after = await (await request.get(`/recipes/${slug}.md`)).text();
  expect(after).toContain(`- 250 g ${spice}`);
  expect(after).toContain(`- 10 g Deleted rawtext salt ${id}`);
  expect(after).not.toContain('10 g 10 g');
  expect(after).not.toContain('(optional) _(optional)_');
  expect(after).toContain(`- 4 g Deleted rawtext pepper ${id} (optional)`);
});
