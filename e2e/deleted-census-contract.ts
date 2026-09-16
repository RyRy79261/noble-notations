/**
 * What the census script and the spec that reads it agree on.
 *
 * Kept in a file of its own, with no side effects, for the same reason
 * `e2e/github-stub-contract.ts` exists: `e2e/deleted-census.ts` RUNS at
 * import time — it is a script, and it calls `process.exit` when it is done
 * — so a spec that imported it to borrow one constant would run a census
 * inside the Playwright worker and take the worker down with it. Writing the
 * constants out twice instead would put the assertion and the thing asserted
 * on two different pieces of paper.
 */

/**
 * Written into every readable field of every record the fixture deletes:
 * the slug is the one exception, because a slug is lower case by regular
 * expression.
 */
export const BIN = 'ZZBIN';

/** Written into the records the fixture keeps. */
export const KEEP = 'ZZKEEP';

/** The census prints its JSON between these, so a stray log line cannot spoil it. */
export const BEGIN = '---CENSUS-BEGIN---';
export const END = '---CENSUS-END---';

/**
 * What the fixture in `e2e/data-deleted.spec.ts` wrote, handed to the census
 * through `CENSUS_FIXTURE` in the environment.
 *
 * The names carry a per-run stamp, because a serial describe that fails is
 * RETRIED from its `beforeAll` — and `create_recipe` on a slug a deleted
 * recipe holds is refused by design. A fixed slug would make every retry
 * fail for a reason that has nothing to do with the test.
 */
export interface CensusFixture {
  binRecipe: string;
  keepRecipe: string;
  binRun: string;
  keepRun: string;
  binIngredient: string;
  keepIngredient: string;
  binTag: string;
  keepTag: string;
  /** The deleted tag's label as free text, for the search-vector leak. */
  binTagLabel: string;
  /** The deleted ingredient's name as free text, for the same reason. */
  binIngredientName: string;
  /**
   * Strings that must appear in NO read result.
   *
   * The sentinel AND the deleted slugs. `listRecipeSlugs` returns slugs and
   * nothing else — and it is the read `pnpm export` and the sitemap walk —
   * so a forbidden list of one upper-case word would not cover the one read
   * where a leak is most visible to the outside world.
   */
  forbidden: string[];
  /** A read result must carry at least one of these, or it did not run. */
  keepMarkers: string[];
}

/** One call, and what the scan found in what it returned. */
export interface CallReport {
  name: string;
  label: string;
  /** Every forbidden string found, with how many times. */
  found: Record<string, number>;
  /** Whether a live marker appeared: the per-call positive control. */
  live: boolean;
  /** Serialised length, so an empty answer is visible without a sentinel. */
  bytes: number;
  error: string | null;
}

export interface CensusReport {
  /** Exported by `read.ts`, absent from the census's call table. */
  missing: string[];
  /** In the call table, no longer exported by `read.ts`. */
  extra: string[];
  results: CallReport[];
}

/**
 * The one read that cannot carry a sentinel.
 *
 * `getStats` returns six integers, and no arrangement of a fixture puts a
 * word in an integer. It is exempt from the per-call positive control and
 * asserted directly instead — `e2e/data-deleted.spec.ts` measures the six
 * counts across a delete and a restore.
 */
export const NO_SENTINEL_POSSIBLE = ['getStats'];
