/**
 * THE POINTER RACE, DRIVEN CLOSE TO THE WRITE LAYER.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE INVARIANT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `src/db/schema.ts` states one thing about `recipes.current_revision_id`:
 * it names a LIVE revision. Every round below ends by reading that column
 * and the row it names. Nothing else is asserted here, because nothing else
 * is the defect: a pointer sitting on a deleted revision is what made
 * `update_recipe` report a withdrawn version as current, took the
 * effectivity line off the page foot, and — the one that matters — let
 * `reviseRecipe` carry a deleted revision's ingredients and steps forward
 * into a new LIVE one, putting withdrawn content back on the public site
 * with no `restore_record` called and nothing to say it happened.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A SCRIPT AND NOT A SPEC, AND NOT AN MCP TEST EITHER
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `e2e/mcp-crud.spec.ts` already drives this pair over the connector and
 * asserts the same invariant. It cannot reach the interleaving. Measured
 * while writing this file, with `deleteRecord`'s locked pointer re-read
 * deleted from `src/lib/queries/write.ts`: 25 repeats of that test passed,
 * and a harder probe of 24 pairs over 48 separate MCP sessions, every call
 * issued in one tick, broke 0 of 24. Two HTTP requests, two session
 * negotiations and two tool handlers do not put two transactions inside a
 * window that is a few statements wide.
 *
 * So the pair is driven by calling the write layer directly, which is what
 * `e2e/deleted-census.ts` does for the read layer and for the same reason.
 * `write.ts` reaches `server-only` through `@/db/client`, which resolves to
 * a throwing client entry outside Next — hence `tsx` under
 * `NODE_OPTIONS=--conditions=react-server`, the escape
 * `e2e/data-archive.spec.ts` established. The spec that reads this output is
 * `e2e/data-pointer.spec.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE GATE: HOW A WINDOW A FEW STATEMENTS WIDE IS MADE RELIABLE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Direct calls overlap, but overlapping is not enough: the two callers have
 * to meet at a particular statement, and which of them gets there first
 * decides whether anything is proved. A round that misses proves nothing and
 * says nothing — which is how a race test becomes a coin toss, and a coin
 * toss that lands green is worse than no test at all.
 *
 * So each gated round holds ONE ROW with a third connection, `BEGIN; SELECT
 * … FOR UPDATE`, and picks the row so that the caller it stops has already
 * passed the decision under test and has not yet committed it. Postgres does
 * the waiting; no sleep decides anything. The gate is released, both calls
 * finish, and the pointer is read.
 *
 * **Round type 1 — the delete has read the pointer (guard M1).** The gate
 * holds a NOTE attached to the revision being deleted.
 * `deleteRecord`'s revision branch reads the pointer, lists the survivors,
 * and only then stamps the notes — so a delete stopped at
 * `stampNotes(notes.revisionId, …)` is a delete that has made its decision
 * about the pointer and committed nothing. `updateRecipe` is then issued.
 * With the guard, the delete has held `recipes` under `FOR UPDATE` since it
 * read the pointer, so the update queues, finds the revision deleted when it
 * gets in, and refuses. Without the guard, the delete never locks that row
 * at all — the pointer names a different revision, so the branch's final
 * `UPDATE` is skipped — the update walks straight past, writes the pointer
 * onto the revision the delete is about to remove, and the delete, holding
 * the value it read before any of that, leaves it there.
 *
 * **Round type 2 — the update has checked the revision (guard M4).** The
 * gate holds the recipe's `recipe_terms` row. `updateRecipe` reads the
 * revision it is about to point at and checks `deleted_at` BEFORE it calls
 * `applyTaxonomy`, whose first statement is `DELETE FROM recipe_terms …` for
 * that recipe — so an update stopped there is an update that has already
 * decided the revision is live. The delete then runs to completion and
 * commits. With the guard, the update re-reads the revision under the recipe
 * row's lock, sees the delete's stamp and refuses. Without it, the update
 * writes the pointer from the value it read before the delete existed.
 *
 * This is the same shape as `e2e/github-stub.ts` holding a port: the test
 * owns the environment the code under test runs in, rather than hoping for
 * it. What the gate does NOT do is change the code path — both callers run
 * every statement they would otherwise run, in the same order, through the
 * same transactions. It decides only who reaches the contested row first.
 *
 * The natural rounds are the control: the same pair with nothing held.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE SECOND PAIR: TWO DELETES, AND THE LOCK ORDER BETWEEN THEM
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `delete_record` on a RECIPE against `delete_record` on a REVISION of that
 * recipe. It is the same driver because it is the same machinery — a
 * fixture, a gate, a round, one JSON report — and a different question:
 * not where the pointer ends up, but whether the two callers can be caught
 * holding each other's rows. The pointer fix above is what made them able
 * to: it gave the revision branch a second lock, on `recipes`, taken AFTER
 * the revision — and a recipe delete takes those two in the opposite order
 * because the recipe is the row it addresses. `TREE_SCENARIOS` in
 * `./pointer-race-contract` carries the full statement of it, and
 * `lockRecipeTree` in `src/lib/queries/write.ts` is the only thing that
 * keeps the two orders apart. These rounds are reported in `treeRounds` and
 * asserted by a test of their own, because their invariant is a different
 * one: a recipe in the bin is SUPPOSED to point at a deleted revision, so
 * the rule the rounds above assert is false for every round below.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT IT LEAVES BEHIND
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Nothing. Every record is named `zzrace-…` and hard-deleted at the end, by
 * `DELETE` and not by `delete_record`: these are fixtures for a race, and a
 * hundred soft-deleted revisions left in the bin would move the counts
 * `e2e/data-deleted.spec.ts` measures and put rows in front of every reader
 * of `list_deleted`.
 *
 * Usage: `tsx --tsconfig tsconfig.json e2e/pointer-race.ts`, with
 * `DATABASE_URL` set. `POINTER_RACE_GATED`, `POINTER_RACE_NATURAL`,
 * `POINTER_RACE_TREE` and `POINTER_RACE_TREE_NATURAL` override the four
 * round counts, and a zero skips that shape entirely — which is how the two
 * specs that read this output each pay for the rounds they assert on and
 * not for the other's.
 */
import { Client } from 'pg';
import {
  addNote,
  createRecipe,
  deleteRecord,
  reviseRecipe,
  updateRecipe,
  type DeleteResult,
  type RecordAddress,
} from '../src/lib/queries/write';
import {
  addNoteSchema,
  createRecipeSchema,
  reviseRecipeSchema,
  updateRecipeSchema,
} from '../src/lib/domain/schemas';
import {
  BEGIN,
  END,
  GATED_ROUNDS,
  NATURAL_ROUNDS,
  RACE_PREFIX,
  SCENARIOS,
  TREE_GATED_ROUNDS,
  TREE_NATURAL_ROUNDS,
  TREE_SCENARIOS,
  type PointerState,
  type RaceReport,
  type RoundReport,
  type Scenario,
  type Settled,
  type SettledDelete,
  type StampedRow,
  type TreeRoundReport,
  type TreeScenario,
  type TreeState,
} from './pointer-race-contract';

const URL = process.env.DATABASE_URL;
if (!URL) throw new Error('DATABASE_URL is required to drive the race.');

const GATED = Number(process.env.POINTER_RACE_GATED ?? GATED_ROUNDS);
const NATURAL = Number(process.env.POINTER_RACE_NATURAL ?? NATURAL_ROUNDS);
const TREE = Number(process.env.POINTER_RACE_TREE ?? TREE_GATED_ROUNDS);
const TREE_NATURAL = Number(
  process.env.POINTER_RACE_TREE_NATURAL ?? TREE_NATURAL_ROUNDS,
);

/**
 * How long a wait for a lock may take before the round gives up and says so.
 *
 * On a healthy machine every wait here is over in a few milliseconds, so the
 * budget is for a loaded one. THE SECOND NUMBER IS THE IMPORTANT ONE: if the
 * gate ever stops engaging — a statement moved inside the write layer, a
 * fixture that stopped writing the row it holds — then EVERY round would
 * spend the full budget twice, 160 rounds would take half an hour, and the
 * spec would report a timeout instead of the `gateEngaged: false` that names
 * the cause. So the first round to give up shortens the budget for the rest:
 * the run still produces all 160 rounds and still says exactly what went
 * wrong, in about a minute.
 */
const WAIT_MS = 5_000;
const GIVEN_UP_MS = 250;
const POLL_MS = 5;

let budget = WAIT_MS;
const giveUp = () => {
  budget = GIVEN_UP_MS;
};

/** Every round deletes revision 1 and points the update at revision 1. */
const TARGET = 1;

const REASON = 'Deleted on purpose by e2e/pointer-race.ts.';
const ACTOR = 'e2e-pointer-race';

/** A tag, so the update has taxonomy work and the gate has a row to hold. */
const TAG = 'ZZRACE holding tag';
/** More of them, to widen the natural rounds the way the gate widens the others. */
const MANY_TAGS = [TAG, 'ZZRACE second tag', 'ZZRACE third tag'];

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/**
 * Poll until `condition` holds. Returns false on timeout rather than
 * throwing: a gate that never engaged is a measurement the spec has to see,
 * not an exception that hides the round it came from.
 */
async function until(
  condition: () => Promise<boolean>,
  ms = budget,
): Promise<boolean> {
  const deadline = Date.now() + ms;
  for (;;) {
    if (await condition()) return true;
    if (Date.now() >= deadline) return false;
    await sleep(POLL_MS);
  }
}

/**
 * Attach the handlers now, report later.
 *
 * A round has to know whether a call has finished WHILE it is still deciding
 * what to do next, and it must never leave a rejection unhandled in the
 * meantime — the write layer refuses by throwing, and a refusal is the
 * correct outcome of half these rounds.
 */
function settled<T>(promise: Promise<T>): {
  result: Promise<Settled>;
  done: () => boolean;
} {
  let finished = false;
  const result = promise.then(
    (): Settled => {
      finished = true;
      return { status: 'fulfilled', error: null, codes: [] };
    },
    (error: unknown): Settled => {
      finished = true;
      return {
        status: 'rejected',
        error: reason(error),
        codes: codesOf(error),
      };
    },
  );
  return { result, done: () => finished };
}

/** The sentence a rejection carries, for a failure that names itself. */
const reason = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Every SQLSTATE on a rejection's cause chain, outermost first.
 *
 * WALKED RATHER THAN READ OFF THE TOP, because the error the caller catches
 * is not the one the server sent: drizzle wraps the driver's error and the
 * write layer wraps that again, so `error.code` on the outermost is
 * undefined and `40P01` is two or three `cause` hops down. The chain is
 * bounded so a self-referential cause cannot spin, and non-string codes are
 * dropped — Node puts its own `code` on some errors and `ERR_*` is not a
 * SQLSTATE, but keeping it costs nothing and the spec matches on the value
 * it is looking for rather than on the shape of the list.
 */
function codesOf(error: unknown): string[] {
  const codes: string[] = [];
  let current: unknown = error;
  for (
    let depth = 0;
    depth < 8 && current !== null && current !== undefined;
    depth += 1
  ) {
    const { code, cause } = current as { code?: unknown; cause?: unknown };
    if (typeof code === 'string' && code.length > 0) codes.push(code);
    if (cause === current) break;
    current = cause;
  }
  return codes;
}

/**
 * The same, for a call whose RESULT the round needs and not only its fate.
 *
 * `delete_record` hands back the event id it minted and a list of what went
 * with it, and the tree rounds check the database against both. A refused
 * call has neither, and null is the honest value: it is what "this call
 * wrote nothing" looks like.
 */
function settledDelete(promise: Promise<DeleteResult>): {
  result: Promise<SettledDelete>;
  done: () => boolean;
} {
  let finished = false;
  const result = promise.then(
    (value): SettledDelete => {
      finished = true;
      return {
        status: 'fulfilled',
        error: null,
        codes: [],
        eventId: value.eventId,
        cascaded: value.cascaded,
      };
    },
    (error: unknown): SettledDelete => {
      finished = true;
      return {
        status: 'rejected',
        error: reason(error),
        codes: codesOf(error),
        eventId: null,
        cascaded: null,
      };
    },
  );
  return { result, done: () => finished };
}

/** One connection that holds a row, and knows which backend it is. */
class Gate {
  private released = false;

  private constructor(
    private readonly client: Client,
    readonly pid: number,
  ) {}

  static async open(): Promise<Gate> {
    const client = new Client({ connectionString: URL });
    await client.connect();
    const { rows } = await client.query<{ pid: number }>(
      'SELECT pg_backend_pid() AS pid',
    );
    await client.query('BEGIN');
    return new Gate(client, rows[0]!.pid);
  }

  /** Take the row. Returns how many rows it actually holds. */
  async hold(text: string, params: unknown[]): Promise<number> {
    const { rowCount } = await this.client.query(text, params);
    return rowCount ?? 0;
  }

  async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    await this.client.query('ROLLBACK');
  }

  async close(): Promise<void> {
    await this.release().catch(() => {});
    await this.client.end().catch(() => {});
  }
}

/** Hold a row for the length of one round, whatever the round does. */
async function withGate<T>(body: (gate: Gate) => Promise<T>): Promise<T> {
  const gate = await Gate.open();
  try {
    return await body(gate);
  } finally {
    await gate.close();
  }
}

/** Everything one round needs that outlives it. */
interface Ctx {
  /** Reads the pointer and cleans up. Never holds anything. */
  sql: Client;
  /** Reads `pg_stat_activity`. Its own connection, so a poll cannot queue. */
  watch: Client;
  prefix: string;
}

/** The backends currently waiting on any of `pids`. */
async function waitingOn(ctx: Ctx, pids: number[]): Promise<number[]> {
  if (pids.length === 0) return [];
  const { rows } = await ctx.watch.query<{ pid: number }>(
    `SELECT pid FROM pg_stat_activity WHERE pg_blocking_pids(pid) && $1::int[]`,
    [pids],
  );
  return rows.map((row) => row.pid);
}

interface Fixture {
  slug: string;
  recipeId: string;
  /** Revision 1: the one the delete removes and the update points at. */
  targetRevisionId: string;
}

/**
 * A recipe with two versions, the pointer on the SECOND one.
 *
 * That is the state the whole race needs, and it is not incidental. A delete
 * of a revision the pointer does not name takes the branch that leaves the
 * pointer alone — so it never locks the recipe row for the write, and the
 * update is free to move the pointer onto the row the delete is removing.
 * A delete of the CURRENT revision moves the pointer itself and is the case
 * `lockRecipeTree` and the survivor list already cover.
 */
async function makeFixture(
  ctx: Ctx,
  name: string,
  wants: { note: boolean; tag: boolean },
): Promise<Fixture> {
  const slug = `${ctx.prefix}-${name}`;
  await createRecipe(
    createRecipeSchema.parse({
      title: `ZZRACE ${name}`,
      slug,
      rationale: 'Version 1. The version both calls are about.',
      ...(wants.tag ? { categories: { technique: [TAG] } } : {}),
    }),
  );
  await reviseRecipe(
    reviseRecipeSchema.parse({
      slug,
      rationale: 'Version 2. The pointer sits here, not on version 1.',
    }),
  );
  if (wants.note) {
    await addNote(
      addNoteSchema.parse({
        recipeSlug: slug,
        revisionNumber: TARGET,
        kind: 'observation',
        body: 'The gate holds this note. See e2e/pointer-race.ts.',
      }),
    );
  }

  const { rows } = await ctx.sql.query<{
    recipe_id: string;
    revision_id: string;
    current_revision_id: string | null;
  }>(
    `SELECT r.id AS recipe_id, r.current_revision_id, rr.id AS revision_id
       FROM recipes r
       JOIN recipe_revisions rr
         ON rr.recipe_id = r.id AND rr.revision_number = $2
      WHERE r.slug = $1`,
    [slug, TARGET],
  );
  const row = rows[0];
  if (!row) throw new Error(`the fixture "${slug}" was not written`);
  if (row.current_revision_id === row.revision_id) {
    throw new Error(
      `the fixture "${slug}" points at revision ${TARGET}; the race needs ` +
        'the pointer on a different revision',
    );
  }
  return {
    slug,
    recipeId: row.recipe_id,
    targetRevisionId: row.revision_id,
  };
}

/** The column, and the row it names. */
async function pointerOf(ctx: Ctx, recipeId: string): Promise<PointerState> {
  const { rows } = await ctx.sql.query<{
    current_revision_id: string | null;
    revision_number: number | null;
    deleted_at: Date | null;
  }>(
    `SELECT r.current_revision_id, rr.revision_number, rr.deleted_at
       FROM recipes r
       LEFT JOIN recipe_revisions rr ON rr.id = r.current_revision_id
      WHERE r.id = $1`,
    [recipeId],
  );
  const row = rows[0]!;
  return {
    currentRevisionId: row.current_revision_id,
    revisionNumber: row.revision_number,
    deletedAt: row.deleted_at ? row.deleted_at.toISOString() : null,
    broken:
      row.current_revision_id === null ||
      row.revision_number === null ||
      row.deleted_at !== null,
  };
}

const address = (slug: string): RecordAddress => ({
  kind: 'revision',
  slug,
  revisionNumber: TARGET,
});

const removeTarget = (slug: string) =>
  deleteRecord(address(slug), { reason: REASON, actor: ACTOR });

const pointAtTarget = (slug: string, categories?: string[]) =>
  updateRecipe(
    updateRecipeSchema.parse({
      slug,
      currentRevisionNumber: TARGET,
      ...(categories ? { categories: { technique: categories } } : {}),
    }),
  );

/** Round type 1: the delete has read the pointer and has not committed. */
async function gatedDeleteFirst(ctx: Ctx, round: number): Promise<RoundReport> {
  const fixture = await makeFixture(ctx, `m1-${round}`, {
    note: true,
    tag: false,
  });

  const { remove, update, gateEngaged, secondCallQueued } = await withGate(
    async (gate) => {
      const held = await gate.hold(
        `SELECT id FROM notes
          WHERE revision_id = $1 AND deleted_at IS NULL
          FOR UPDATE`,
        [fixture.targetRevisionId],
      );
      if (held === 0) {
        throw new Error(
          'the fixture note is missing, so the gate holds nothing and the ' +
            'round would prove nothing',
        );
      }

      // The delete stops at `stampNotes(notes.revisionId, …)`, which is
      // AFTER it has read the pointer and decided what to do with it.
      const removing = settled(removeTarget(fixture.slug));
      const engaged = await until(
        async () => (await waitingOn(ctx, [gate.pid])).length > 0,
      );
      if (!engaged) giveUp();

      // Now the other one, into a window that is held open rather than hoped
      // for. With the guard it queues behind the delete; without it, there is
      // nothing to queue behind and it writes the pointer.
      const updating = settled(pointAtTarget(fixture.slug));
      const saw = await until(async () => {
        if (updating.done()) return true;
        const first = await waitingOn(ctx, [gate.pid]);
        return (await waitingOn(ctx, first)).length > 0;
      });
      if (!saw) giveUp();
      // Read BEFORE the gate goes. Afterwards every call has finished and
      // the question "is it still waiting" has only one answer.
      const queued = saw && !updating.done();

      await gate.release();
      const [removed, updated] = await Promise.all([
        removing.result,
        updating.result,
      ]);
      return {
        remove: removed,
        update: updated,
        gateEngaged: engaged,
        secondCallQueued: queued,
      };
    },
  );

  return {
    scenario: SCENARIOS.gatedDeleteFirst,
    round,
    slug: fixture.slug,
    targetRevisionNumber: TARGET,
    gateEngaged,
    secondCallQueued,
    remove,
    update,
    pointer: await pointerOf(ctx, fixture.recipeId),
    error: null,
  };
}

/** Round type 2: the update has checked the revision and has not written. */
async function gatedUpdateFirst(ctx: Ctx, round: number): Promise<RoundReport> {
  const fixture = await makeFixture(ctx, `m4-${round}`, {
    note: false,
    tag: true,
  });

  const { remove, update, gateEngaged, secondCallQueued } = await withGate(
    async (gate) => {
      const held = await gate.hold(
        `SELECT rt.recipe_id FROM recipe_terms rt
           JOIN taxonomy_terms t ON t.id = rt.term_id AND t.deleted_at IS NULL
          WHERE rt.recipe_id = $1
          FOR UPDATE OF rt`,
        [fixture.recipeId],
      );
      if (held === 0) {
        throw new Error(
          'the fixture carries no live tag, so the gate holds nothing and ' +
            'the round would prove nothing',
        );
      }

      // The update stops inside `applyTaxonomy`, which is AFTER it has read
      // revision 1 and found it live.
      const updating = settled(pointAtTarget(fixture.slug, [TAG]));
      const engaged = await until(
        async () => (await waitingOn(ctx, [gate.pid])).length > 0,
      );
      if (!engaged) giveUp();

      // And the delete runs to completion against a recipe whose update is
      // holding a decision it made before any of this.
      const removed = await settled(removeTarget(fixture.slug)).result;
      const queued = !updating.done();

      await gate.release();
      return {
        remove: removed,
        update: await updating.result,
        gateEngaged: engaged,
        secondCallQueued: queued,
      };
    },
  );

  return {
    scenario: SCENARIOS.gatedUpdateFirst,
    round,
    slug: fixture.slug,
    targetRevisionNumber: TARGET,
    gateEngaged,
    secondCallQueued,
    remove,
    update,
    pointer: await pointerOf(ctx, fixture.recipeId),
    error: null,
  };
}

/**
 * The control: both calls into one tick, nothing held.
 *
 * The update is given tags in the order that needs them — an update issued
 * first has to still be working when the delete commits, and taxonomy is the
 * work it does between reading the revision and writing the pointer.
 */
async function naturalRound(
  ctx: Ctx,
  round: number,
  deleteFirst: boolean,
): Promise<RoundReport> {
  const fixture = await makeFixture(
    ctx,
    `${deleteFirst ? 'nd' : 'nu'}-${round}`,
    { note: false, tag: true },
  );

  const pair = deleteFirst
    ? [
        settled(removeTarget(fixture.slug)),
        settled(pointAtTarget(fixture.slug)),
      ]
    : [
        settled(pointAtTarget(fixture.slug, MANY_TAGS)),
        settled(removeTarget(fixture.slug)),
      ];
  const [first, second] = await Promise.all([pair[0]!.result, pair[1]!.result]);

  return {
    scenario: deleteFirst
      ? SCENARIOS.naturalDeleteFirst
      : SCENARIOS.naturalUpdateFirst,
    round,
    slug: fixture.slug,
    targetRevisionNumber: TARGET,
    gateEngaged: false,
    secondCallQueued: false,
    remove: deleteFirst ? first! : second!,
    update: deleteFirst ? second! : first!,
    pointer: await pointerOf(ctx, fixture.recipeId),
    error: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// THE OTHER PAIR: a recipe delete against a revision delete of that recipe
// ─────────────────────────────────────────────────────────────────────────

const removeRecipe = (slug: string) =>
  deleteRecord({ kind: 'recipe', slug }, { reason: REASON, actor: ACTOR });

/**
 * The recipe, its versions and its notes, as the pair left them.
 *
 * Read in ONE transaction at REPEATABLE READ, so the three statements see
 * one instant. Read committed would let a round that is somehow still
 * writing show a recipe from before a commit and its revisions from after,
 * and the spec would report an incoherence the code never produced.
 */
async function treeOf(ctx: Ctx, recipeId: string): Promise<TreeState> {
  const stamp = (row: {
    deleted_at: Date | null;
    deleted_event_id: string | null;
  }): StampedRow => ({
    deletedAt: row.deleted_at ? row.deleted_at.toISOString() : null,
    eventId: row.deleted_event_id,
  });

  await ctx.sql.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  try {
    const recipe = await ctx.sql.query<{
      deleted_at: Date | null;
      deleted_event_id: string | null;
    }>(`SELECT deleted_at, deleted_event_id FROM recipes WHERE id = $1`, [
      recipeId,
    ]);
    const revisions = await ctx.sql.query<{
      revision_number: number;
      deleted_at: Date | null;
      deleted_event_id: string | null;
    }>(
      `SELECT revision_number, deleted_at, deleted_event_id
         FROM recipe_revisions WHERE recipe_id = $1
        ORDER BY revision_number`,
      [recipeId],
    );
    const notes = await ctx.sql.query<{
      deleted_at: Date | null;
      deleted_event_id: string | null;
    }>(
      `SELECT n.deleted_at, n.deleted_event_id
         FROM notes n
         LEFT JOIN recipe_revisions rr ON rr.id = n.revision_id
        WHERE n.recipe_id = $1 OR rr.recipe_id = $1`,
      [recipeId],
    );
    return {
      recipe: stamp(recipe.rows[0]!),
      revisions: revisions.rows.map((row) => ({
        revisionNumber: row.revision_number,
        ...stamp(row),
      })),
      notes: notes.rows.map(stamp),
    };
  } finally {
    await ctx.sql.query('COMMIT');
  }
}

/**
 * THE GATED ROUND, and the whole reason this pair is here.
 *
 * WHERE THE GATE IS PLACED: on the fixture's NOTE, which hangs off revision
 * 1. It is the same row the M1 round holds and a different caller is stopped
 * by it, because this time it is the RECIPE delete that has to touch it.
 *
 * `deleteRecord` addressing a recipe runs, in this order:
 *
 *   1. `lockRecipeTree` — the advisory lock, before any row lock            <- the guard
 *   2. `resolveAddress` — SELECT recipes … FOR UPDATE OF recipes            <- takes A
 *   3. the runs, and the notes on them                     (none here)
 *   4. the notes on the steps                              (none here)
 *   5. the notes on the revisions — UPDATE notes …                          <- STOPS HERE
 *   6. the notes on the recipe
 *   7. UPDATE recipe_revisions … — the cascade over every version           <- wants B
 *   8. UPDATE recipes — the root
 *
 * Measured with a fourth connection while the gate was held: the parked
 * backend is stuck on
 *
 *     update "notes" set "deleted_at" = $1, … where ("notes"."deleted_at"
 *       is null and "notes"."revision_id" in ($5, $6)) returning "id"
 *
 * holding `recipes` and `notes`, having taken no lock on `recipe_revisions`
 * at all, and both versions still reading live from outside.
 *
 * Step 5 is the window and nothing else is: it is AFTER the recipe row is
 * locked and BEFORE the first statement that touches `recipe_revisions`. A
 * gate any earlier stops the call before it holds `recipes` and there is no
 * inversion to reach; a gate at step 7 or later stops it once it already
 * holds both rows, and a caller holding both is a caller that cannot
 * deadlock. Between 2 and 7 there is one other row this fixture could offer
 * — a note on the recipe, at step 6 — and it proves the same thing one
 * statement later; the note on the revision is chosen because `makeFixture`
 * already writes it for the M1 round and a fixture that two shapes share is
 * a fixture that cannot drift apart from one of them.
 *
 * With the recipe delete parked there, the revision delete is issued. It
 * takes `recipe_revisions` in its own `resolveAddress` and then asks for
 * `recipes` in the locked pointer re-read — the statement the pointer fix
 * added. That is the cycle, held open on purpose:
 *
 *   recipe delete   holds recipes           wants recipe_revisions (step 7)
 *   revision delete holds recipe_revisions  wants recipes
 *
 * With `lockRecipeTree` in place the revision delete never gets that far: it
 * waits at the advisory lock holding NOTHING, the gate releases, the recipe
 * delete finishes its cascade and commits, and the revision delete then
 * finds its target already deleted and refuses. Without it, both callers are
 * holding one row and waiting for the other, and Postgres kills one after
 * `deadlock_timeout`.
 */
async function gatedRecipeFirst(
  ctx: Ctx,
  number: number,
): Promise<TreeRoundReport> {
  const fixture = await makeFixture(ctx, `m2-${number}`, {
    note: true,
    tag: false,
  });

  const { recipeCall, revisionCall, gateEngaged, secondCallQueued } =
    await withGate(async (gate) => {
      const held = await gate.hold(
        `SELECT id FROM notes
          WHERE revision_id = $1 AND deleted_at IS NULL
          FOR UPDATE`,
        [fixture.targetRevisionId],
      );
      if (held === 0) {
        throw new Error(
          'the fixture note is missing, so the gate holds nothing and the ' +
            'round would prove nothing',
        );
      }

      // Parked at step 5: holding `recipes`, not yet at `recipe_revisions`.
      const removingRecipe = settledDelete(removeRecipe(fixture.slug));
      const engaged = await until(
        async () => (await waitingOn(ctx, [gate.pid])).length > 0,
      );
      if (!engaged) giveUp();

      // The other order, into the window rather than at it.
      const removingRevision = settledDelete(removeTarget(fixture.slug));
      const saw = await until(async () => {
        if (removingRevision.done()) return true;
        const first = await waitingOn(ctx, [gate.pid]);
        return (await waitingOn(ctx, first)).length > 0;
      });
      if (!saw) giveUp();
      // Read BEFORE the gate goes, while "is it still waiting" still has two
      // possible answers.
      const queued = saw && !removingRevision.done();

      await gate.release();
      const [byRecipe, byRevision] = await Promise.all([
        removingRecipe.result,
        removingRevision.result,
      ]);
      return {
        recipeCall: byRecipe,
        revisionCall: byRevision,
        gateEngaged: engaged,
        secondCallQueued: queued,
      };
    });

  return {
    scenario: TREE_SCENARIOS.gatedRecipeFirst,
    round: number,
    slug: fixture.slug,
    targetRevisionNumber: TARGET,
    gateEngaged,
    secondCallQueued,
    removeRecipe: recipeCall,
    removeRevision: revisionCall,
    tree: await treeOf(ctx, fixture.recipeId),
    error: null,
  };
}

/**
 * The control: both deletes into one tick, nothing held.
 *
 * Ungated, this pair is not the coin toss the M1/M4 control is — the same
 * mutation broke 39 of 40 of these rounds, because the two calls are short
 * and symmetrical and they meet on their own most of the time. What it
 * cannot do is say WHICH way round they met, which is why the gate above
 * carries the assertion and this carries the coherence rules: it is the only
 * shape in which the revision delete is allowed to win, and a rule that only
 * ever sees one winner is a rule that has been checked from one side.
 *
 * WHICH IS WHY THE ODD ROUNDS ISSUE THE RECIPE DELETE FIRST AND THE EVEN
 * ROUNDS ISSUE THE REVISION DELETE FIRST. Nothing here waits, so whichever
 * is issued first reaches `lockRecipeTree` first and the other queues behind
 * it — not as a guarantee, it is a natural round and the scheduler owns it,
 * but as the only way to make the second winner appear at all. Issued one
 * way round every time, the revision delete lost 10 of 10 and the branch
 * where a revision carries its own event id under a recipe carrying another
 * was never reached.
 */
async function naturalTreePair(
  ctx: Ctx,
  number: number,
): Promise<TreeRoundReport> {
  const fixture = await makeFixture(ctx, `nt-${number}`, {
    note: true,
    tag: false,
  });

  const recipeFirst = number % 2 === 1;
  const pair = recipeFirst
    ? [
        settledDelete(removeRecipe(fixture.slug)),
        settledDelete(removeTarget(fixture.slug)),
      ]
    : [
        settledDelete(removeTarget(fixture.slug)),
        settledDelete(removeRecipe(fixture.slug)),
      ];
  const [first, second] = await Promise.all([pair[0]!.result, pair[1]!.result]);
  const byRecipe = recipeFirst ? first! : second!;
  const byRevision = recipeFirst ? second! : first!;

  return {
    scenario: TREE_SCENARIOS.naturalTreePair,
    round: number,
    slug: fixture.slug,
    targetRevisionNumber: TARGET,
    gateEngaged: false,
    secondCallQueued: false,
    removeRecipe: byRecipe,
    removeRevision: byRevision,
    tree: await treeOf(ctx, fixture.recipeId),
    error: null,
  };
}

/** Take the round, and never let a thrown round hide the rounds after it. */
async function round(
  ctx: Ctx,
  scenario: Scenario,
  number: number,
  run: () => Promise<RoundReport>,
): Promise<RoundReport> {
  try {
    return await run();
  } catch (error) {
    return {
      scenario,
      round: number,
      slug: '',
      targetRevisionNumber: TARGET,
      gateEngaged: false,
      secondCallQueued: false,
      remove: { status: 'rejected', error: null, codes: [] },
      update: { status: 'rejected', error: null, codes: [] },
      pointer: {
        currentRevisionId: null,
        revisionNumber: null,
        deletedAt: null,
        broken: true,
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** The same, for the tree pair. A thrown round is reported, not raised. */
async function treeRound(
  ctx: Ctx,
  scenario: TreeScenario,
  number: number,
  run: () => Promise<TreeRoundReport>,
): Promise<TreeRoundReport> {
  try {
    return await run();
  } catch (error) {
    const refused: SettledDelete = {
      status: 'rejected',
      error: null,
      codes: [],
      eventId: null,
      cascaded: null,
    };
    return {
      scenario,
      round: number,
      slug: '',
      targetRevisionNumber: TARGET,
      gateEngaged: false,
      secondCallQueued: false,
      removeRecipe: refused,
      removeRevision: refused,
      tree: {
        recipe: { deletedAt: null, eventId: null },
        revisions: [],
        notes: [],
      },
      error: reason(error),
    };
  }
}

/**
 * Remove every record the driver wrote, for real.
 *
 * The recipes cascade to their revisions, lines, steps and notes. The tags
 * and the canonical ingredients do not hang off a recipe, so they are named
 * here — all of them carry the same prefix, which is what makes a sweep by
 * name safe rather than clever.
 */
async function sweep(ctx: Ctx): Promise<void> {
  await ctx.sql.query(`DELETE FROM recipes WHERE slug LIKE $1`, [
    `${RACE_PREFIX}-%`,
  ]);
  await ctx.sql.query(`DELETE FROM taxonomy_terms WHERE slug LIKE $1`, [
    `${RACE_PREFIX}-%`,
  ]);
  await ctx.sql.query(`DELETE FROM ingredients WHERE slug LIKE $1`, [
    `${RACE_PREFIX}-%`,
  ]);
}

async function main(): Promise<void> {
  const sql = new Client({ connectionString: URL });
  const watch = new Client({ connectionString: URL });
  await sql.connect();
  await watch.connect();
  const ctx: Ctx = {
    sql,
    watch,
    prefix: `${RACE_PREFIX}-${Date.now().toString(36)}`,
  };

  const report: RaceReport = {
    rounds: [],
    treeRounds: [],
    asked: {
      gated: GATED,
      natural: NATURAL,
      tree: TREE,
      treeNatural: TREE_NATURAL,
    },
  };

  try {
    for (let n = 1; n <= GATED; n += 1) {
      report.rounds.push(
        await round(ctx, SCENARIOS.gatedDeleteFirst, n, () =>
          gatedDeleteFirst(ctx, n),
        ),
      );
      report.rounds.push(
        await round(ctx, SCENARIOS.gatedUpdateFirst, n, () =>
          gatedUpdateFirst(ctx, n),
        ),
      );
    }
    for (let n = 1; n <= NATURAL; n += 1) {
      report.rounds.push(
        await round(ctx, SCENARIOS.naturalDeleteFirst, n, () =>
          naturalRound(ctx, n, true),
        ),
      );
      report.rounds.push(
        await round(ctx, SCENARIOS.naturalUpdateFirst, n, () =>
          naturalRound(ctx, n, false),
        ),
      );
    }
    for (let n = 1; n <= TREE; n += 1) {
      report.treeRounds.push(
        await treeRound(ctx, TREE_SCENARIOS.gatedRecipeFirst, n, () =>
          gatedRecipeFirst(ctx, n),
        ),
      );
    }
    for (let n = 1; n <= TREE_NATURAL; n += 1) {
      report.treeRounds.push(
        await treeRound(ctx, TREE_SCENARIOS.naturalTreePair, n, () =>
          naturalTreePair(ctx, n),
        ),
      );
    }
  } finally {
    await sweep(ctx);
    await sql.end();
    await watch.end();
  }

  /*
   * Printed, and WAITED FOR, because `process.exit` below drops whatever is
   * still queued on a pipe.
   *
   * The report is tens of kilobytes and a pipe buffer is 64. Driven by hand
   * through a shell — `tsx e2e/pointer-race.ts | jq`, which is how a person
   * looks at one round — the tail is lost and what arrives is a truncated
   * object that reads as corrupt JSON rather than as a dropped write. The
   * spec's `execFileSync` drains the pipe for the whole run and has never
   * lost a byte, so this is belt and braces there; at a terminal it is the
   * difference between a report and a syntax error.
   *
   * The exit itself has to stay: `withTransaction` holds a pool open and
   * this process does not end on its own.
   */
  await new Promise<void>((flushed) => {
    process.stdout.write(
      `\n${BEGIN}\n${JSON.stringify(report, null, 2)}\n${END}\n`,
      () => flushed(),
    );
  });
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
