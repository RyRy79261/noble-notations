import 'server-only';

/**
 * The live view of the repository, and the one deliberate hole in it.
 *
 * Six tables carry a soft delete — `recipes`, `recipe_revisions`, `notes`,
 * `experiments`, `ingredients`, `taxonomy_terms` — and `src/db/schema.ts`
 * defines a `*_live` view over each one that is `WHERE deleted_at IS NULL`
 * and nothing else. `read.ts` selects from those views and from no base
 * table, and `eslint.config.mjs` makes naming one of the six in `read.ts` a
 * lint error, which is a CI gate.
 *
 * This module exists so the two exceptions to that ban have a name that says
 * what they are, rather than an inline import that reads like every other
 * one.
 *
 * THE LIST OF FILES THAT MAY SEE A DELETED ROW IS THREE LONG:
 *
 *   1. `src/lib/queries/write.ts` — it writes the flag and clears it.
 *   2. `src/lib/queries/deleted.ts` — listing the bin is its whole job, and
 *      it is the one read module that filters nothing.
 *   3. `read.ts`, for `recipeRevisionsAll` below, and only there.
 *
 * Anything else that needs a deleted row is a new query in `deleted.ts`, not
 * a fourth exception here.
 */
export {
  recipesLive,
  recipeRevisionsLive,
  notesLive,
  experimentsLive,
  ingredientsLive,
  taxonomyTermsLive,
} from '@/db/schema';

/**
 * `recipe_revisions` INCLUDING deleted rows. The name is the warning.
 *
 * The only reader is the pair of experiment reads in `read.ts`, and the
 * reason is that a batch log outlives the version it cooked. Deleting a
 * revision does not touch a run pinned to it — the run happened, and a
 * record of a run that says it cooked nothing is a lie about the run. So
 * `listExperiments` and `getExperiment` join this rather than
 * `recipeRevisionsLive`, keep printing the number, and set
 * `revisionWithdrawn` from `deleted_at IS NOT NULL` so the reader is told the
 * version is gone.
 *
 * Nothing else may import it. A revision reached through this alias must be
 * used for its number and its withdrawn state only — never to draw a
 * revision's title, ingredients or steps, which is what `recipeRevisionsLive`
 * is for.
 */
export { recipeRevisions as recipeRevisionsAll } from '@/db/schema';
