import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { Client } from 'pg';
import { mcpClient, tokens, type McpClient } from './helpers';
import {
  BEGIN,
  END,
  GATED_ROUNDS,
  NATURAL_ROUNDS,
  SCENARIOS,
  TREE_GATED_ROUNDS,
  TREE_NATURAL_ROUNDS,
  TREE_SCENARIOS,
  type RaceReport,
  type RoundReport,
  type SettledDelete,
  type TreeRoundReport,
} from './pointer-race-contract';

/**
 * ═════════════════════════════════════════════════════════════════════════
 * ONE COLUMN, AND THE THREE THINGS THAT KEEP IT HONEST
 * ═════════════════════════════════════════════════════════════════════════
 *
 * `src/db/schema.ts` states one invariant about
 * `recipes.current_revision_id`: **it names a LIVE revision**. A delete moves
 * it off a revision it removes, an update refuses to move it onto a deleted
 * one, and a revise reads it to decide what an omitted list carries forward.
 *
 * The branch that gave the connector delete found a race that broke it: two
 * concurrent deletes, and the pointer ended up on a deleted revision. The
 * visible damage was not the column. It was `revise_recipe` reading that
 * pointer and carrying the deleted revision's ingredients and steps into a
 * new LIVE version — withdrawn content back on the public site, no
 * `restore_record` called, nothing in any log to say it happened.
 *
 * Three guards in `src/lib/queries/write.ts` hold that line, and the suite
 * had a test for none of them. Each is asserted here:
 *
 * | Guard | Where | This file |
 * | ----- | ----- | --------- |
 * | the `isNull(deletedAt)` on `reviseRecipe`'s `previous` read | `reviseRecipe` | test 1 |
 * | the pointer re-read under `FOR UPDATE` | `deleteRecord`, revision branch | test 2 |
 * | the same re-read from the other side | `updateRecipe` | test 2 |
 * | `lockRecipeTree`, the advisory lock over one recipe | `deleteRecord`, `restoreRecord` | test 3 |
 *
 * **Why there is a third test, and why it is in this file.** The fourth
 * guard is here because the second one is what made it necessary. Giving
 * `deleteRecord`'s revision branch a locked read of `recipes` gave that
 * branch a second lock, taken AFTER the revision — and a `deleteRecord`
 * addressing the RECIPE takes the same two rows the other way round,
 * because the recipe is the row it addresses and the revisions are its
 * cascade. Two callers, the same two rows, opposite orders: an ABBA
 * deadlock, built by the fix for the race above. `lockRecipeTree` is the
 * mutex that keeps the two orders from ever being in flight together, no
 * test failed when it was disabled, and test 3 is that test.
 *
 * **Why the first test forces the column with raw SQL.** The state it puts
 * the row into is the state the race used to produce, and every path that
 * could still produce it is now closed — which is exactly why the backstop
 * inside `reviseRecipe` has no other way to be reached. What is under test
 * is not how the pointer got there; it is what the NEXT call does when it
 * finds it there. A test that could only reach it through the race would be
 * testing the race, and the race is test 2.
 *
 * **Why the second test is a subprocess.** It drives the write layer
 * directly, because the MCP transport cannot put two transactions inside a
 * window a few statements wide — measured, with numbers, in the header of
 * `e2e/pointer-race.ts`. The mechanism is the one
 * `e2e/data-archive.spec.ts` established and `e2e/deleted-census.ts` already
 * uses: `tsx` under `NODE_OPTIONS=--conditions=react-server`, because
 * `write.ts` reaches `server-only`.
 */

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3100}`;
const ROOT = process.cwd();
const TSX = path.join(ROOT, 'node_modules', '.bin', 'tsx');
const TSCONFIG = path.join(ROOT, 'tsconfig.json');
const RACE = path.join(ROOT, 'e2e', 'pointer-race.ts');

/** Everything this file writes is named with it, and removed by it. */
const PREFIX = 'zzptr';

function rw(): McpClient {
  return mcpClient(BASE, tokens().readWrite);
}

let counter = 0;
function stamp(): string {
  counter += 1;
  return `${Date.now().toString(36)}${counter.toString(36)}`;
}

/** A connection of this file's own. `global-setup.ts` opens one the same way. */
async function connect(): Promise<Client> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  return client;
}

interface WriteResult {
  slug: string;
  revisionNumber: number;
}
interface RecipeResult {
  revisionNumber: number;
  ingredients: { rawText: string; ingredient: { slug: string } | null }[];
  steps: { instruction: string }[];
}

/** A revision's body as it is stored, and a hash of it. */
interface Body {
  lines: string[];
  steps: string[];
  /** Null when the revision carries no line and no step at all. */
  hash: string | null;
}

async function bodyOf(
  sql: Client,
  slug: string,
  revisionNumber: number,
): Promise<Body> {
  const { rows } = await sql.query<{
    lines: string[] | null;
    steps: string[] | null;
  }>(
    `SELECT
       (SELECT array_agg(ri.raw_text ORDER BY ri.position)
          FROM recipe_ingredients ri WHERE ri.revision_id = rr.id) AS lines,
       (SELECT array_agg(st.instruction ORDER BY st.position)
          FROM recipe_steps st WHERE st.revision_id = rr.id) AS steps
       FROM recipe_revisions rr
       JOIN recipes r ON r.id = rr.recipe_id
      WHERE r.slug = $1 AND rr.revision_number = $2`,
    [slug, revisionNumber],
  );
  const row = rows[0];
  expect(
    row,
    `recipe "${slug}" has no revision ${revisionNumber}`,
  ).toBeTruthy();
  const lines = row!.lines ?? [];
  const steps = row!.steps ?? [];
  return {
    lines,
    steps,
    hash:
      lines.length + steps.length === 0
        ? null
        : createHash('md5')
            .update(JSON.stringify({ lines, steps }))
            .digest('hex'),
  };
}

// ═════════════════════════════════════════════════════════════════════════
// 1. The backstop: what the next call does with a pointer that is wrong
// ═════════════════════════════════════════════════════════════════════════

test('revise_recipe does not carry a deleted version forward, whatever the pointer says', async () => {
  test.slow();
  const mcp = rw();
  const sql = await connect();
  const id = stamp();
  const slug = `${PREFIX}-backstop-${id}`;
  const POISON_STEP = 'POISON STEP — withdrawn content.';
  const poisonSalt = `ZZPTR poison salt ${id}`;

  try {
    // Version 1 carries the body that is about to be withdrawn.
    await mcp.call('create_recipe', {
      title: `ZZPTR backstop ${id}`,
      slug,
      rationale: 'Version 1. The version that gets withdrawn.',
      ingredients: [{ name: poisonSalt, quantity: 200, unit: 'g' }],
      steps: [{ instruction: POISON_STEP }],
    });
    // Version 2 is what people read, and it supersedes version 1 entirely.
    await mcp.call('revise_recipe', {
      slug,
      rationale: 'Version 2. The version people read.',
      ingredients: [{ name: `ZZPTR kept salt ${id}`, quantity: 10, unit: 'g' }],
      steps: [{ instruction: 'Kept step.' }],
    });
    await mcp.call('delete_record', {
      kind: 'revision',
      slug,
      revisionNumber: 1,
      reason: 'Withdrawn on purpose by e2e/data-pointer.spec.ts.',
    });

    const withdrawn = await bodyOf(sql, slug, 1);
    // The control for the whole test: the withdrawn version HAS a body, so a
    // later "the new version does not carry it" means something.
    expect(withdrawn.lines).toEqual([expect.stringContaining(poisonSalt)]);
    expect(withdrawn.steps).toEqual([POISON_STEP]);
    expect(withdrawn.hash).not.toBeNull();

    /*
     * THE STATE THE RACE USED TO PRODUCE, forced directly.
     *
     * Two concurrent deletes left the pointer here. Both paths that could do
     * that are now shut — which is the point: this is the state no call can
     * create any more, and `reviseRecipe`'s own filter is the only thing
     * standing between it and a republication. Forcing it is how the
     * backstop gets reached at all.
     */
    const forced = await sql.query(
      `UPDATE recipes r
          SET current_revision_id = rr.id
         FROM recipe_revisions rr
        WHERE rr.recipe_id = r.id AND rr.revision_number = 1 AND r.slug = $1`,
      [slug],
    );
    expect(forced.rowCount, 'the pointer was not forced').toBe(1);

    // And it really is pointing at a deleted revision now. Without this the
    // test could pass because the forcing silently did nothing.
    const pointer = await sql.query<{
      revision_number: number;
      deleted_at: Date | null;
    }>(
      `SELECT rr.revision_number, rr.deleted_at
         FROM recipes r JOIN recipe_revisions rr ON rr.id = r.current_revision_id
        WHERE r.slug = $1`,
      [slug],
    );
    expect(pointer.rows[0]?.revision_number).toBe(1);
    expect(pointer.rows[0]?.deleted_at).not.toBeNull();

    /*
     * NO INGREDIENTS AND NO STEPS, so every line of the body must come from
     * the version this one supersedes — which is what makes this the call
     * that republishes. `revise_recipe` carries omitted lists forward, and
     * the pointer is what tells it where to carry them from.
     */
    const next = await mcp.call<WriteResult>('revise_recipe', {
      slug,
      rationale: 'Version 3, written while the pointer was wrong.',
    });
    expect(next.revisionNumber).toBe(3);

    // THE ASSERTION. The new LIVE version must not be the withdrawn one.
    const carried = await bodyOf(sql, slug, 3);
    expect(
      carried.hash,
      `revision 3 carries the withdrawn body: ${JSON.stringify(carried)}`,
    ).not.toBe(withdrawn.hash);
    expect(carried.steps).not.toContain(POISON_STEP);
    expect(carried.lines.join(' | ')).not.toContain(poisonSalt);

    // And the same thing read the way a reader reaches it, because the defect
    // was never the column — it was withdrawn text on the public page.
    const read = await mcp.call<RecipeResult>('get_recipe', { slug });
    expect(read.steps.map((step) => step.instruction)).not.toContain(
      POISON_STEP,
    );
    expect(
      read.ingredients.map((line) => line.rawText).join(' | '),
    ).not.toContain(poisonSalt);
  } finally {
    // Leave the database as it was found. A hard delete, because these rows
    // are a fixture: a soft one would leave a recipe in `list_deleted` and
    // move the counts `e2e/data-deleted.spec.ts` measures.
    await sql.query(`DELETE FROM recipes WHERE slug LIKE $1`, [`${PREFIX}-%`]);
    await sql.query(`DELETE FROM ingredients WHERE slug LIKE $1`, [
      `${PREFIX}-%`,
    ]);
    await sql.end();
  }
});

// ═════════════════════════════════════════════════════════════════════════
// 2. The two re-reads: delete against update, in both orders
// ═════════════════════════════════════════════════════════════════════════

/** One line per round, so a failure names the round and what it did. */
function describeRound(round: RoundReport): string {
  return (
    `${round.scenario} #${round.round} (${round.slug}): ` +
    `delete ${round.remove.status}, update ${round.update.status}` +
    `${round.update.error ? ` — ${round.update.error}` : ''}; ` +
    `pointer → revision ${round.pointer.revisionNumber ?? 'nothing'}` +
    `${round.pointer.deletedAt ? `, DELETED at ${round.pointer.deletedAt}` : ''}` +
    `${round.error ? `; round failed: ${round.error}` : ''}`
  );
}

/**
 * Drive the race in a subprocess and read its report.
 *
 * `counts` names the four round counts. THE TWO TESTS THAT CALL THIS EACH
 * ZERO THE OTHER'S ROUNDS: the driver races two different pairs with two
 * different invariants, one report holds both, and a test that paid for
 * rounds it does not assert on would be charging the suite for nothing.
 */
function drive(counts: Record<string, string>): RaceReport {
  const stdout = execFileSync(TSX, ['--tsconfig', TSCONFIG, RACE], {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 240_000,
    // `write.ts` imports `server-only`, which resolves to a throwing client
    // entry outside Next. Same escape `e2e/data-archive.spec.ts` uses.
    env: {
      ...process.env,
      NODE_OPTIONS: '--conditions=react-server',
      ...counts,
    },
  });

  const body = stdout.slice(
    stdout.indexOf(BEGIN) + BEGIN.length,
    stdout.indexOf(END),
  );
  expect(
    body.trim().length,
    `the race driver printed no report:\n${stdout.slice(-4000)}`,
  ).toBeGreaterThan(0);
  return JSON.parse(body) as RaceReport;
}

test('a delete and an update racing for one pointer always leave it on a live version', async () => {
  test.setTimeout(300_000);

  const report = drive({
    POINTER_RACE_TREE: '0',
    POINTER_RACE_TREE_NATURAL: '0',
  });

  const gated = report.rounds.filter(
    (round) =>
      round.scenario === SCENARIOS.gatedDeleteFirst ||
      round.scenario === SCENARIOS.gatedUpdateFirst,
  );
  const natural = report.rounds.filter((round) => !gated.includes(round));

  // Every round the driver was asked for ran. A driver that quietly did
  // twelve rounds instead of forty would make every count below smaller and
  // nothing else would say so.
  expect(report.asked).toEqual({
    gated: GATED_ROUNDS,
    natural: NATURAL_ROUNDS,
    tree: 0,
    treeNatural: 0,
  });
  expect(gated).toHaveLength(GATED_ROUNDS * 2);
  expect(natural).toHaveLength(NATURAL_ROUNDS * 2);

  // A round that threw is a round that proved nothing.
  expect(
    report.rounds.filter((round) => round.error).map(describeRound),
  ).toEqual([]);

  /*
   * THE POSITIVE CONTROL, and the reason this test is not a coin toss.
   *
   * Each gated round holds one row so that the loser of the race is stopped
   * at a statement it has already passed the decision under test — see the
   * header of `e2e/pointer-race.ts` for which row and why. If the gate ever
   * stops engaging, the two calls never meet, the invariant below holds for
   * the wrong reason, and this line is what says so.
   */
  expect(
    gated.filter((round) => !round.gateEngaged).map(describeRound),
    'the gate held nothing: the rounds below proved nothing',
  ).toEqual([]);

  // The delete addresses a live revision of a live recipe every time, and a
  // fix that made it lose to a concurrent update would be a different bug.
  expect(
    report.rounds
      .filter((round) => round.remove.status !== 'fulfilled')
      .map(describeRound),
  ).toEqual([]);

  /*
   * THE INVARIANT. `src/db/schema.ts`: `current_revision_id` names a live
   * revision. Every round, gated or not, either order.
   */
  expect(
    report.rounds.filter((round) => round.pointer.broken).map(describeRound),
    'a recipe is pointing at a deleted revision',
  ).toEqual([]);

  /*
   * And what each gated round must have ANSWERED, which is the tighter half.
   *
   * In both gated shapes the delete of that revision is committed by the
   * time the update gets to write, so the only correct outcome is a refusal
   * — and the refusal has to be the one that says the revision is deleted,
   * not a deadlock, not an internal error. A guard that was removed shows up
   * here as a success, one line per round, before the invariant above is
   * even reached.
   */
  expect(
    gated
      .filter((round) => round.update.status !== 'rejected')
      .map(describeRound),
    'an update wrote the pointer onto a revision a delete had removed',
  ).toEqual([]);
  expect(
    gated
      .filter((round) => !/deleted/i.test(round.update.error ?? ''))
      .map(describeRound),
    'an update was refused for the wrong reason',
  ).toEqual([]);

  /*
   * The natural rounds issue both calls into one tick and hold nothing, so
   * either outcome is legitimate: an update that reached the recipe row
   * first wrote the pointer and the delete then moved it off again. What is
   * not legitimate is a refusal that is not this refusal.
   */
  expect(
    natural
      .filter(
        (round) =>
          round.update.status === 'rejected' &&
          !/deleted/i.test(round.update.error ?? ''),
      )
      .map(describeRound),
  ).toEqual([]);
});

// ═════════════════════════════════════════════════════════════════════════
// 3. The lock order: a recipe delete against a revision delete of that one
// ═════════════════════════════════════════════════════════════════════════

/**
 * `deadlock_detected`, and the three neighbours that mean the same thing.
 *
 * ASSERT ON THE CODE, NEVER ON THE SENTENCE. `40P01` arrives as
 * `deadlock detected` on this machine and as whatever `lc_messages` says on
 * the next one; a test that greps for the English passes on a database that
 * is deadlocking in German. The five characters do not move.
 *
 * The other three are here because the defect is "the lock manager had to
 * kill one of these two calls", and `40P01` is only the way it says so
 * today. A future `lock_timeout` or a `SELECT … NOWAIT` would end the same
 * transaction with the same nothing done, under `55P03` or `57014`, and an
 * assertion naming one code would call that green.
 */
const DEADLOCK = '40P01';
const LOCK_FAILURES = new Set([
  DEADLOCK,
  '40001', // serialization_failure
  '55P03', // lock_not_available
  '57014', // query_canceled — what `lock_timeout` looks like to the caller
]);

/** Both calls of one round, so a rule is written once and reads them both. */
const bothCalls = (round: TreeRoundReport): SettledDelete[] => [
  round.removeRecipe,
  round.removeRevision,
];

const brokeOnALock = (round: TreeRoundReport): boolean =>
  bothCalls(round).some((call) =>
    call.codes.some((code) => LOCK_FAILURES.has(code)),
  );

/** What a call SAID went with it, by kind. A refused call said nothing. */
const counted = (call: SettledDelete, kind: string): number =>
  call.cascaded?.find((entry) => entry.kind === kind)?.count ?? 0;

/** What the database actually carries an event id on. */
const stamped = (rows: { eventId: string | null }[], id: string | null) =>
  id === null ? 0 : rows.filter((row) => row.eventId === id).length;

const shorten = (text: string | null): string =>
  text === null ? '' : ` — ${text.replace(/\s+/g, ' ').slice(0, 180)}`;

/** One line per round, so a failure names the round and what it did. */
function describeTree(round: TreeRoundReport): string {
  const live = round.tree.revisions.filter((row) => !row.deletedAt).length;
  const codes = bothCalls(round).flatMap((call) => call.codes);
  return (
    `${round.scenario} #${round.round} (${round.slug}): ` +
    `recipe delete ${round.removeRecipe.status}` +
    `${shorten(round.removeRecipe.error)}; ` +
    `revision delete ${round.removeRevision.status}` +
    `${shorten(round.removeRevision.error)}; ` +
    `SQLSTATE ${codes.length > 0 ? codes.join(', ') : 'none'}; ` +
    `gate ${round.gateEngaged ? 'engaged' : 'DID NOT ENGAGE'}, second call ` +
    `${round.secondCallQueued ? 'queued' : 'not seen queued'}; ` +
    `recipe ${round.tree.recipe.deletedAt ? 'deleted' : 'STILL LIVE'}, ` +
    `${round.tree.revisions.length} version(s), ${live} still live` +
    `${round.error ? `; round failed: ${round.error}` : ''}`
  );
}

test('a recipe delete and a revision delete of that recipe never deadlock', async () => {
  test.setTimeout(300_000);

  const report = drive({
    POINTER_RACE_GATED: '0',
    POINTER_RACE_NATURAL: '0',
  });

  const rounds = report.treeRounds;
  const gated = rounds.filter(
    (round) => round.scenario === TREE_SCENARIOS.gatedRecipeFirst,
  );
  const natural = rounds.filter(
    (round) => round.scenario === TREE_SCENARIOS.naturalTreePair,
  );

  // Every round the driver was asked for ran, and the other pair's rounds
  // were not paid for twice.
  expect(report.asked).toEqual({
    gated: 0,
    natural: 0,
    tree: TREE_GATED_ROUNDS,
    treeNatural: TREE_NATURAL_ROUNDS,
  });
  expect(gated).toHaveLength(TREE_GATED_ROUNDS);
  expect(natural).toHaveLength(TREE_NATURAL_ROUNDS);
  expect(rounds.filter((round) => round.error).map(describeTree)).toEqual([]);

  /*
   * THE POSITIVE CONTROL. Each gated round parks the recipe delete holding
   * the recipe row and nothing below it, and issues the revision delete into
   * that window — see `gatedRecipeFirst` in `e2e/pointer-race.ts` for the
   * statement it is parked at and why that one. A gate that stopped engaging
   * would make two calls that never meet, every assertion below would hold
   * for the wrong reason, and this line is what says so.
   */
  expect(
    gated.filter((round) => !round.gateEngaged).map(describeTree),
    'the gate held nothing: the rounds below proved nothing',
  ).toEqual([]);

  /*
   * ═══════════════════════════════════════════════════════════════════════
   * THE ASSERTION: NOBODY WAS KILLED TO BREAK A CYCLE
   * ═══════════════════════════════════════════════════════════════════════
   *
   * A recipe delete locks `recipes` first and `recipe_revisions` last. A
   * revision delete locks `recipe_revisions` first and `recipes` second, in
   * the pointer re-read test 2 exists for. Held apart only by
   * `lockRecipeTree`; with that advisory lock disabled these rounds
   * deadlocked 40 of 40 gated and 39 of 40 ungated, every one of them on
   * the re-read:
   *
   *     select "slug", "current_revision_id" from "recipes"
   *       where "recipes"."id" = $1 limit $2 for update of "recipes"
   *
   * What the agent sees when that happens is `An internal error occurred` —
   * the write layer does not translate SQLSTATEs — with nothing to say which
   * of its two calls died, nothing to say that retrying would work, and half
   * a delete rolled back beside a half that committed.
   */
  expect(
    rounds
      .filter((round) =>
        bothCalls(round).some((call) => call.codes.includes(DEADLOCK)),
      )
      .map(describeTree),
    'a delete was killed to break a deadlock (SQLSTATE 40P01)',
  ).toEqual([]);
  expect(
    rounds.filter(brokeOnALock).map(describeTree),
    'a delete was refused by the lock manager',
  ).toEqual([]);

  /*
   * ═══════════════════════════════════════════════════════════════════════
   * WHO IS ALLOWED TO LOSE, AND HOW
   * ═══════════════════════════════════════════════════════════════════════
   *
   * One of these two calls legitimately loses: they overlap, the recipe
   * delete's cascade covers every version including the one the other call
   * addresses, and whichever reaches `lockRecipeTree` second finds the work
   * done. So a refusal is not a fault — it is the only correct answer for
   * the second caller, and the point of the guard is that the answer is a
   * sentence rather than a killed transaction.
   *
   * THE LOSER IS ALWAYS THE REVISION DELETE. The recipe delete addresses a
   * live recipe, its cascade carries `deleted_at IS NULL` on every row it
   * touches, and nothing the other call can do makes any of that refuse — a
   * build where it did would be a different defect wearing this one's
   * clothes.
   */
  expect(
    rounds
      .filter((round) => round.removeRecipe.status !== 'fulfilled')
      .map(describeTree),
    'the recipe delete lost, and it owns every row the other call touches',
  ).toEqual([]);

  /*
   * And the one refusal the loser is allowed: `delete_record`'s own conflict
   * sentence, the same one any caller gets for addressing a record that is
   * already in the bin — naming the record, the date and the `restore_record`
   * call that undoes it. Not a deadlock, not `stampRoot`'s "deleted by
   * another call while this one ran" (which is the backstop for a writer that
   * takes no lock at all, and is unreachable while two calls on one recipe
   * cannot overlap), and not an unrecognised error.
   */
  expect(
    rounds
      .filter(
        (round) =>
          round.removeRevision.status === 'rejected' &&
          !/is deleted already/i.test(round.removeRevision.error ?? ''),
      )
      .map(describeTree),
    'the revision delete was refused for the wrong reason',
  ).toEqual([]);

  /*
   * In the GATED shape the loser is decided rather than observed: the recipe
   * delete is parked mid-cascade and the revision delete is issued behind it,
   * so by the time the second one can take the tree the first has committed
   * every version. A gated round whose revision delete SUCCEEDED means the
   * two ran through each other.
   */
  expect(
    gated
      .filter((round) => round.removeRevision.status !== 'rejected')
      .map(describeTree),
    'a revision delete completed inside a recipe delete of the same recipe',
  ).toEqual([]);

  /*
   * ═══════════════════════════════════════════════════════════════════════
   * AND WHAT "COHERENT" MEANS WHEN THE DUST SETTLES
   * ═══════════════════════════════════════════════════════════════════════
   *
   * A deadlock is one way this pair can end badly. The other is quieter: two
   * deletes that both write and leave a tree nobody can put back. The rule is
   * `src/db/schema.ts` on `deleted_event_id` — ONE DELETE MINTS ONE UUID and
   * stamps it on the root and on everything that went with it, because
   * `restore_record` clears by the ROOT's id and brings back exactly that
   * set. So:
   *
   *   1. the recipe is deleted, and no version of it is left live under it;
   *   2. the root carries the event of the call that deleted it, not of the
   *      other one — the exact swap that let a restore bring back a recipe
   *      and leave its versions in the bin;
   *   3. every version and every note carries one of the two event ids these
   *      two calls actually minted, and nothing else;
   *   4. at least one version carries the recipe's own event, so restoring
   *      the recipe gives back something that can be read — a recipe with no
   *      version cannot be, and `deleteRecord` refuses to make one;
   *   5. each call's receipt matches the ledger: what it SAID went with it is
   *      what the database carries its stamp on. A winning revision delete
   *      withdrew exactly one version — its own — and never a sibling.
   */
  expect(
    rounds
      .filter((round) => round.tree.recipe.deletedAt === null)
      .map(describeTree),
    'both deletes finished and the recipe is still live',
  ).toEqual([]);
  expect(
    rounds
      .filter((round) => round.tree.revisions.some((row) => !row.deletedAt))
      .map(describeTree),
    'a deleted recipe was left with a live version under it',
  ).toEqual([]);
  expect(
    rounds
      .filter(
        (round) => round.tree.recipe.eventId !== round.removeRecipe.eventId,
      )
      .map(describeTree),
    'the recipe carries an event id its own delete did not mint',
  ).toEqual([]);
  expect(
    rounds
      .filter((round) => {
        const minted = [
          round.removeRecipe.eventId,
          round.removeRevision.eventId,
        ];
        return [...round.tree.revisions, ...round.tree.notes].some(
          (row) => !minted.includes(row.eventId),
        );
      })
      .map(describeTree),
    'a row carries an event id neither call reported: it cannot be restored',
  ).toEqual([]);
  expect(
    rounds
      .filter(
        (round) =>
          stamped(round.tree.revisions, round.removeRecipe.eventId) === 0,
      )
      .map(describeTree),
    'restoring the recipe would give back a recipe with no version to read',
  ).toEqual([]);
  expect(
    rounds
      .filter(
        (round) =>
          // The recipe delete's root is the recipe, so every version it
          // stamped is a cascade and is counted in its receipt.
          stamped(round.tree.revisions, round.removeRecipe.eventId) !==
            counted(round.removeRecipe, 'revision') ||
          stamped(round.tree.notes, round.removeRecipe.eventId) !==
            counted(round.removeRecipe, 'note') ||
          // The revision delete's root IS a version, and a receipt never
          // counts its own root — so exactly one version carries its stamp.
          (round.removeRevision.eventId !== null &&
            (stamped(round.tree.revisions, round.removeRevision.eventId) !==
              1 ||
              stamped(round.tree.notes, round.removeRevision.eventId) !==
                counted(round.removeRevision, 'note'))),
      )
      .map(describeTree),
    'a delete reported a different set from the one it stamped',
  ).toEqual([]);
});
