/**
 * What `e2e/pointer-race.ts` and `e2e/data-pointer.spec.ts` agree on.
 *
 * Kept in a file of its own, with no side effects, for the reason
 * `e2e/deleted-census-contract.ts` gives: `e2e/pointer-race.ts` RUNS at
 * import time — it is a script, and it calls `process.exit` when it is done
 * — so a spec that imported it to borrow one constant would drive the race
 * inside the Playwright worker and take the worker down with it. Writing the
 * constants out twice instead would put the assertion and the thing asserted
 * on two different pieces of paper.
 */

/** The driver prints its JSON between these, so a stray log line cannot spoil it. */
export const BEGIN = '---POINTER-RACE-BEGIN---';
export const END = '---POINTER-RACE-END---';

/**
 * The four ways the pair is driven.
 *
 * The two GATED ones are the tests. Each holds one row the loser must touch,
 * so the interleaving that used to break the pointer happens on every round
 * instead of on the rounds the scheduler happens to arrange — see the header
 * of `e2e/pointer-race.ts` for which row, and why that row and not another.
 *
 * The two NATURAL ones are the same pair with nothing held: they issue both
 * calls into one tick and let the scheduler decide. They cannot be relied on
 * to reach the window — that is the whole reason the gated pair exists — but
 * they cost little, they run the code the way a real pair of connector calls
 * runs it, and the invariant they assert is the same one.
 */
export const SCENARIOS = {
  /** M1: the delete has read the pointer and has not committed. */
  gatedDeleteFirst: 'gated: the delete has read the pointer',
  /** M4: the update has checked the revision and has not written. */
  gatedUpdateFirst: 'gated: the update has checked the revision',
  naturalDeleteFirst: 'natural: the delete is issued first',
  naturalUpdateFirst: 'natural: the update is issued first',
} as const;

export type Scenario = (typeof SCENARIOS)[keyof typeof SCENARIOS];

/**
 * Rounds per scenario: 160 in all, and about six seconds of the suite.
 *
 * Forty is not a ritual number. A gated round is deterministic — it broke 40
 * out of 40 with either re-read removed — so forty of them buys repetition
 * against a machine that is loaded rather than against a scheduler that is
 * lucky. The natural rounds are where forty earns its keep, because they
 * hold nothing and the scheduler mostly settles them the same way: over ten
 * runs, 20 of 400 issued update-first ended with the update refused — the
 * delete had reached the recipe row first — and 0 of 400 issued delete-first
 * did, the update winning that row every time. Twenty rounds would routinely
 * show a whole run of the first kind with none.
 */
export const GATED_ROUNDS = 40;
export const NATURAL_ROUNDS = 40;

/** Every record the driver writes is named with this, and removed by it. */
export const RACE_PREFIX = 'zzrace';

/** One of the two concurrent calls, after it finished. */
export interface Settled {
  status: 'fulfilled' | 'rejected';
  /** The refusal text, so an unexpected failure names itself. */
  error: string | null;
  /**
   * Every SQLSTATE on the rejection's cause chain, outermost first.
   *
   * ASSERT ON THIS AND NOT ON THE TEXT. `40P01` is `deadlock detected`, and
   * the sentence after the code is written in `lc_messages` — a server set to
   * anything but English says it in that language, and a test that greps for
   * the English would then pass on a database that is deadlocking. The code
   * is the same five characters everywhere. It is an array because drizzle
   * wraps the driver's error, so the SQLSTATE is on a cause rather than on
   * the error the caller catches.
   */
  codes: string[];
}

/** Where `recipes.current_revision_id` pointed once both calls had finished. */
export interface PointerState {
  currentRevisionId: string | null;
  /** Null when the pointer names no row at all. */
  revisionNumber: number | null;
  /** Set when the pointer names a revision somebody deleted. THE DEFECT. */
  deletedAt: string | null;
  broken: boolean;
}

export interface RoundReport {
  scenario: Scenario;
  round: number;
  slug: string;
  /** The revision the delete removed and the update tried to point at. */
  targetRevisionNumber: number;
  /**
   * Whether the gate actually held a row a caller then waited on.
   *
   * THE POSITIVE CONTROL, and the reason this field is reported rather than
   * assumed. A gate that stopped engaging — a statement reordered inside the
   * write layer, a fixture that stopped writing the row it holds — would
   * turn every round into two calls that never meet, and the invariant would
   * hold for the wrong reason on code with no guard at all. The spec asserts
   * this on every gated round.
   */
  gateEngaged: boolean;
  /**
   * Whether the second caller was seen queued behind the first. Reported,
   * not asserted: on shipped code it is what the guard does, and without the
   * guard the second caller has nothing to queue behind — so it is the
   * measurement that says which of the two happened, and a slow machine that
   * observed neither still has `gateEngaged` and the invariant to answer to.
   */
  secondCallQueued: boolean;
  remove: Settled;
  update: Settled;
  pointer: PointerState;
  /** Set when the round itself failed, rather than the calls it drove. */
  error: string | null;
}

export interface RaceReport {
  rounds: RoundReport[];
  /** The other pair: a recipe delete against a revision delete. */
  treeRounds: TreeRoundReport[];
  /** What the driver was asked for, so the spec can see it ran them all. */
  asked: { gated: number; natural: number; tree: number; treeNatural: number };
}

// ═════════════════════════════════════════════════════════════════════════
// THE OTHER PAIR: two deletes over one recipe, and the lock order between
// ═════════════════════════════════════════════════════════════════════════

/**
 * The second pair the driver races, and why it is reported separately.
 *
 * Everything above is ONE PAIR — `delete_record` on a revision against
 * `update_recipe` — and one invariant: the pointer names a live revision.
 * This pair is `delete_record` on a RECIPE against `delete_record` on a
 * REVISION of that same recipe, and the invariant is a different one, so the
 * rounds are a different shape and live in their own array rather than
 * widening `RoundReport` with fields three quarters of it would leave null.
 *
 * **What this pair is about: lock order, not the pointer.**
 * `THE LOCK ORDER` in `src/lib/queries/write.ts` states the rule — `recipes`
 * is locked LAST by every writer — and names the one exception it cannot
 * avoid: a delete addressing a RECIPE locks `recipes` FIRST, in
 * `resolveAddress`, because the recipe is the row it addresses, and reaches
 * `recipe_revisions` last, in the cascade. A delete addressing a REVISION
 * does the opposite: `recipe_revisions` first in `resolveAddress`, then
 * `recipes` second, in the locked pointer re-read that the pointer race
 * above is the reason for. Two callers, the same two rows, opposite orders.
 * That is ABBA, and the fix for one race is what built it.
 *
 * `lockRecipeTree` — `pg_advisory_xact_lock` on the recipe's id, taken as the
 * first statement of both `deleteRecord` and `restoreRecord`, before any row
 * lock at all — is what keeps the two orders from ever being in flight on one
 * recipe. Nothing else does. No other test in this suite drives a recipe
 * delete against a revision delete, so with the advisory lock removed the
 * whole suite stays green while `delete_record` deadlocks: measured at 39 of
 * 40 rounds ungated, and 40 of 40 through the gate below.
 *
 * **And why a deadlock is not merely untidy.** Postgres waits
 * `deadlock_timeout` — a second, by default — picks a victim and kills it.
 * The agent sees `An internal error occurred`, with nothing to say which of
 * its two calls died or that retrying would work, and half a delete stays
 * rolled back on a machine where the other half committed.
 */
export const TREE_SCENARIOS = {
  /** The recipe delete holds `recipes` and has not yet reached the revisions. */
  gatedRecipeFirst: 'gated: the recipe delete holds the recipe row',
  naturalTreePair: 'natural: both deletes issued into one tick',
} as const;

export type TreeScenario = (typeof TREE_SCENARIOS)[keyof typeof TREE_SCENARIOS];

/**
 * Rounds per shape, and why the gated ones carry the weight.
 *
 * A gated round is deterministic in both directions: it deadlocked 40 of 40
 * with `lockRecipeTree` disabled and 0 of 40 with it in place, because the
 * gate parks the recipe delete holding `recipes` and nothing else, which is
 * the one moment at which the revision delete can complete the cycle. Forty
 * of them costs about a second and a half.
 *
 * The natural rounds hold nothing and issue both calls into one tick. For
 * THIS pair they are not decoration — the same mutation broke 39 of 40 of
 * them — but 39 of 40 is not 40 of 40, and a test that is allowed to be
 * lucky once in forty is a test people learn to re-run. They are the control:
 * they run the pair the way two connector calls would run it, and they are
 * the only shape in which the revision delete can win, so the coherence rules
 * the spec asserts are exercised from both sides.
 */
export const TREE_GATED_ROUNDS = 40;
export const TREE_NATURAL_ROUNDS = 10;

/** A settled `delete_record`, with the receipt it hands back. */
export interface SettledDelete extends Settled {
  /**
   * The uuid this call minted, or null if it was refused.
   *
   * ONE DELETE MINTS ONE EVENT ID and stamps it on the root and on
   * everything that went with it; `restore_record` clears by the ROOT's id.
   * So this is the thread the spec pulls to ask whether two concurrent
   * deletes left one undoable set each, or one tangle.
   */
  eventId: string | null;
  /** What the call said went with it, to check against what actually did. */
  cascaded: { kind: string; count: number }[] | null;
}

/** One row of the recipe's tree, as it was left. */
export interface StampedRow {
  deletedAt: string | null;
  eventId: string | null;
}

/** The whole tree after both calls finished. */
export interface TreeState {
  recipe: StampedRow;
  /** Keyed by revision number, in order. */
  revisions: (StampedRow & { revisionNumber: number })[];
  /** Every note under the recipe, including the one the gate held. */
  notes: StampedRow[];
}

export interface TreeRoundReport {
  scenario: TreeScenario;
  round: number;
  slug: string;
  /** The revision the second call addressed. */
  targetRevisionNumber: number;
  /** THE POSITIVE CONTROL. See `RoundReport.gateEngaged`. */
  gateEngaged: boolean;
  /** Whether the revision delete was seen queued behind the recipe delete. */
  secondCallQueued: boolean;
  /** `delete_record` on the recipe. */
  removeRecipe: SettledDelete;
  /** `delete_record` on revision 1 of that recipe. */
  removeRevision: SettledDelete;
  tree: TreeState;
  /** Set when the round itself failed, rather than the calls it drove. */
  error: string | null;
}
