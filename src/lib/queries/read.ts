import 'server-only';

/**
 * Read path.
 *
 * Every page and every read-only MCP tool goes through these functions, so
 * the site and the connector can never disagree about what a recipe is.
 * Results are plain serialisable objects — numerics are converted out of
 * Postgres' string representation here rather than in twelve call sites.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NOTHING IN THIS FILE READS A DELETED ROW.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Six tables carry a soft delete, and each has a `*_live` view over it in
 * `src/db/schema.ts` that is `WHERE deleted_at IS NULL` and nothing else.
 * This file selects from those views. A read that names the base table by
 * mistake publishes a record somebody deleted, and it fails silently:
 * nothing throws, the page renders, and the row is back.
 *
 * Three things hold that, in decreasing order of strength:
 *
 * 1. **`eslint.config.mjs` bans the six base tables from this file.** A new
 *    query CANNOT name one, and `pnpm lint` is a CI gate. This was chosen
 *    over a shared `and(live(t), …)` helper for one reason: a helper can be
 *    left out of a new query, an import ban cannot.
 * 2. **The raw SQL below names the views.** There are four sites the lint
 *    rule cannot see inside — `searchRecipes`, `listIngredients`,
 *    `getStats`, and the two note-rule fragments. Each one says `_live`.
 * 3. **`e2e/data-deleted.spec.ts` calls every exported function** against a
 *    fixture whose deleted records carry a sentinel string, and fails when
 *    the set of exported functions and the set it calls are not equal. A
 *    sixteenth read that nobody added to that table fails the suite on the
 *    day it lands, naming itself.
 *
 * TWO DELIBERATE EXCEPTIONS, and both are named where they are used:
 *
 * - `listExperiments` and `getExperiment` join `recipeRevisionsAll` — the
 *   base table — because a batch log outlives the version it cooked. They
 *   read the number and `revisionWithdrawn` from it, nothing else.
 * - `listDeleted` is NOT in this file. It lives in `./deleted`, which is the
 *   one read module allowed to see deleted rows, because listing the bin is
 *   its whole job. Keeping the ban here absolute is the mechanism; an
 *   exception inside this file is the hole the next query walks through.
 *
 * The child tables — `recipe_ingredients`, `recipe_steps`, `note_sources`,
 * `experiment_items`, `experiment_observations`, the mass flow and the link
 * tables — carry no flag and need none. Their lifetime is their parent's,
 * and every child read below starts from a live parent.
 */
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { SQLWrapper } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  experimentItems,
  experimentObservations,
  experimentsLive,
  ingredientRelations,
  ingredientsLive,
  noteSources,
  notesLive,
  recipeIngredients,
  recipeLinks,
  recipeMassFlowStages,
  recipeMassFlows,
  recipeRevisionsLive,
  recipeStepIngredients,
  recipeSteps,
  recipeTerms,
  recipesLive,
  taxonomyTermsLive,
} from '@/db/schema';
// `recipe_revisions` unfiltered, for the two experiment reads and nothing
// else. The alias is the warning; `./live` says why it exists.
import { recipeRevisionsAll } from '@/lib/queries/live';
import { slugify } from '@/lib/domain/slug';
import {
  formatAggregate,
  formatIngredientLine,
  formatQuantity,
  pluraliseUnit,
  quantityBucket,
  unresolvedLineName,
  unresolvedLineNeeds,
  type QuantityBucket,
} from '@/lib/domain/units';
import { categoryRank } from '@/lib/site';
import type { CategoryType, SearchRecipesInput } from '@/lib/domain/schemas';

const n = (v: string | null) => (v == null ? null : Number(v));

// ─────────────────────────────────────────────────────────────────────────
// View models
// ─────────────────────────────────────────────────────────────────────────

export interface TermView {
  id: string;
  /** Which kind of category this tag is in. The DB column is `facet`. */
  categoryType: CategoryType;
  slug: string;
  label: string;
  description: string | null;
  isPrimary?: boolean;
}

export interface IngredientLineView {
  id: string;
  position: number;
  component: string | null;
  quantity: number | null;
  quantityMax: number | null;
  unit: string | null;
  preparation: string | null;
  optional: boolean;
  note: string | null;
  rawText: string;
  ingredient: { slug: string; name: string; category: string } | null;
}

export interface StepView {
  id: string;
  position: number;
  phase: string | null;
  instruction: string;
  durationMinutes: number | null;
  durationMaxMinutes: number | null;
  temperatureC: number | null;
  equipment: string[];
  technique: { slug: string; label: string } | null;
  imageUrl: string | null;
  imageAlt: string | null;
  note: string | null;
  /**
   * The ingredient lines this step consumes.
   *
   * The id rather than only the name, so a step can show the amount as
   * well: "10 g Jasmine rice" beside the instruction is the difference
   * between reading a method and cooking from it. Names alone would mean
   * matching on a string and guessing which of two rice lines was meant.
   */
  uses: { recipeIngredientId: string; name: string }[];
}

export interface NoteView {
  id: string;
  kind: string;
  title: string | null;
  body: string;
  /**
   * The conditions a `science` note holds under, as separate values —
   * R-SCR-41. Empty on every other kind, and on a science note that has not
   * been given any; a caller draws no row for an empty list.
   */
  conditions: string[];
  createdAt: string;
  sources: {
    url: string | null;
    title: string | null;
    citation: string | null;
    accessedAt: string | null;
  }[];
}

/**
 * One stage of the mass flow figure — R-SCR-39, D-12.
 *
 * `value` is a formatted string rather than a number and a unit, because
 * the strip holds a mass, a count and two durations side by side and no
 * one type covers all four. The formatting happens here, once, so the
 * figure and the control-bar readout that restates it cannot disagree.
 */
export interface MassFlowStageView {
  /** Stored as written; the drawing uppercases it. */
  label: string;
  /** `10 kg`, `25–30 pieces`, `24–48 h`. Null when the stage has no figure. */
  value: string | null;
  /** Drawn as the stage that matters — the accent ground and border. */
  emphasis: boolean;
}

export interface RecipeSummaryView {
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  kind: string;
  heroImageUrl: string | null;
  heroImageAlt: string | null;
  revisionNumber: number;
  updatedAt: string;
  terms: TermView[];
}

export interface RecipeView extends RecipeSummaryView {
  id: string;
  originNote: string | null;
  createdAt: string;
  revision: {
    id: string;
    revisionNumber: number;
    title: string;
    summary: string | null;
    rationale: string | null;
    yieldQuantity: number | null;
    yieldUnit: string | null;
    servings: number | null;
    totalTimeMinutes: number | null;
    activeTimeMinutes: number | null;
    /**
     * The mass flow figure, in order, first stage to last. Null when this
     * revision has none, which is the ordinary case: R-SCR-39 asks for it
     * only where a dish loses or gains weight in a way the reader has to
     * plan for.
     *
     * On the REVISION and not on the recipe. Batch five was 8.2 kg and
     * batch six is 10 kg, so a recipe-level figure would draw the current
     * numbers on `/recipes/[slug]/revisions/3`, which renders through the
     * same component.
     */
    massFlow: MassFlowStageView[] | null;
    /**
     * The two summary figures beneath the strip, as separate values:
     * "Net weight loss −55%", "Rate 4.21% per day". Separate rather than
     * one sentence for the same reason a mechanism's conditions are — a
     * caller draws the separator, and one figure gets no separator at all.
     * Empty when neither was recorded, and the caller then draws no
     * summary row.
     */
    massFlowSummary: string[];
    /** Where the figure's numbers came from. Provenance; nothing draws it. */
    massFlowNote: string | null;
    source: string;
    createdAt: string;
  };
  ingredients: IngredientLineView[];
  steps: StepView[];
  notes: NoteView[];
  revisions: {
    revisionNumber: number;
    rationale: string | null;
    source: string;
    createdAt: string;
    /** When this version existed, if that is not when it was recorded. */
    occurredAt: string | null;
    /** True for a version recorded after the fact. */
    backfilled: boolean;
  }[];
  links: { kind: string; note: string | null; recipe: RecipeSummaryView }[];
  backlinks: { kind: string; recipe: RecipeSummaryView }[];
  experiments: { slug: string; title: string; startedAt: string | null }[];
}

// ─────────────────────────────────────────────────────────────────────────
// Shared fragments
// ─────────────────────────────────────────────────────────────────────────

const recipeSummaryColumns = {
  id: recipesLive.id,
  slug: recipesLive.slug,
  title: recipesLive.title,
  subtitle: recipesLive.subtitle,
  summary: recipesLive.summary,
  kind: recipesLive.kind,
  heroImageUrl: recipesLive.heroImageUrl,
  heroImageAlt: recipesLive.heroImageAlt,
  updatedAt: recipesLive.updatedAt,
  revisionNumber: recipeRevisionsLive.revisionNumber,
};

/** Attach taxonomy terms to a batch of recipes in one extra query. */
async function attachTerms<T extends { id: string }>(
  rows: T[],
): Promise<Map<string, TermView[]>> {
  const byRecipe = new Map<string, TermView[]>();
  if (rows.length === 0) return byRecipe;

  const termRows = await db
    .select({
      recipeId: recipeTerms.recipeId,
      isPrimary: recipeTerms.isPrimary,
      id: taxonomyTermsLive.id,
      facet: taxonomyTermsLive.facet,
      slug: taxonomyTermsLive.slug,
      label: taxonomyTermsLive.label,
      description: taxonomyTermsLive.description,
    })
    .from(recipeTerms)
    .innerJoin(taxonomyTermsLive, eq(taxonomyTermsLive.id, recipeTerms.termId))
    .where(
      inArray(
        recipeTerms.recipeId,
        rows.map((r) => r.id),
      ),
    )
    // The facet and the slug are a tiebreak and nothing else. Two terms can
    // share a label across facets — `equipment/oven` and `technique/oven`
    // would — so the pair before them is not unique, and the order of a
    // recipe's tags, and of the `## Categories` block `pnpm export` writes
    // out of it, was undefined whenever that happened. `uq_taxonomy_facet_slug`
    // makes the two of them together unique, so the four columns are total.
    .orderBy(
      desc(recipeTerms.isPrimary),
      asc(taxonomyTermsLive.label),
      asc(taxonomyTermsLive.facet),
      asc(taxonomyTermsLive.slug),
    );

  for (const row of termRows) {
    const list = byRecipe.get(row.recipeId) ?? [];
    list.push({
      id: row.id,
      categoryType: row.facet as CategoryType,
      slug: row.slug,
      label: row.label,
      description: row.description,
      isPrimary: row.isPrimary,
    });
    byRecipe.set(row.recipeId, list);
  }
  return byRecipe;
}

function toSummary(
  row: {
    id: string;
    slug: string;
    title: string;
    subtitle: string | null;
    summary: string | null;
    kind: string;
    heroImageUrl: string | null;
    heroImageAlt: string | null;
    updatedAt: Date;
    revisionNumber: number | null;
  },
  terms: TermView[],
): RecipeSummaryView {
  return {
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    summary: row.summary,
    kind: row.kind,
    heroImageUrl: row.heroImageUrl,
    heroImageAlt: row.heroImageAlt,
    revisionNumber: row.revisionNumber ?? 1,
    updatedAt: row.updatedAt.toISOString(),
    terms,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Lists and search
// ─────────────────────────────────────────────────────────────────────────

export async function listRecipes(options?: {
  limit?: number;
  offset?: number;
  kind?: string;
}): Promise<RecipeSummaryView[]> {
  const rows = await db
    .select(recipeSummaryColumns)
    .from(recipesLive)
    .leftJoin(
      recipeRevisionsLive,
      eq(recipeRevisionsLive.id, recipesLive.currentRevisionId),
    )
    .where(
      options?.kind
        ? and(
            eq(recipesLive.status, 'active'),
            eq(recipesLive.kind, options.kind as 'recipe'),
          )
        : eq(recipesLive.status, 'active'),
    )
    .orderBy(desc(recipesLive.updatedAt))
    .limit(options?.limit ?? 200)
    .offset(options?.offset ?? 0);

  const terms = await attachTerms(rows);
  return rows.map((r) => toSummary(r, terms.get(r.id) ?? []));
}

export interface SearchResult extends RecipeSummaryView {
  rank: number;
}

/**
 * Faceted search.
 *
 * Free text goes through the weighted `search_vector` (title beats an
 * incidental ingredient mention). Taxonomy and ingredient filters are
 * conjunctive — asking for `cuisine: [sichuan]` and `ingredients: [tofu]`
 * means both, which is the behaviour that makes the repository useful for
 * "have I already worked this out?".
 */
export async function searchRecipes(
  input: SearchRecipesInput,
): Promise<{ results: SearchResult[]; total: number }> {
  const conditions = [sql`r.status = 'active'`];

  if (input.query?.trim()) {
    conditions.push(
      sql`r.search_vector @@ websearch_to_tsquery('english', ${input.query.trim()})`,
    );
  }
  if (input.kind) {
    conditions.push(sql`r.kind = ${input.kind}`);
  }

  for (const [facet, labels] of Object.entries(input.categories ?? {})) {
    for (const label of labels ?? []) {
      const slug = slugify(label);
      conditions.push(sql`EXISTS (
        SELECT 1 FROM recipe_terms rt
          JOIN taxonomy_terms_live t ON t.id = rt.term_id
         WHERE rt.recipe_id = r.id
           AND t.facet = ${facet}
           AND (t.slug = ${slug} OR lower(t.label) = ${label.toLowerCase()})
      )`);
    }
  }

  const ingredientClause = (name: string) => {
    const slug = slugify(name);
    return sql`EXISTS (
      SELECT 1 FROM recipe_ingredients ri
        LEFT JOIN ingredients_live i ON i.id = ri.ingredient_id
       WHERE ri.revision_id = r.current_revision_id
         AND (
           i.slug = ${slug}
           OR lower(i.name) = ${name.toLowerCase()}
           OR ri.raw_text ILIKE ${'%' + name + '%'}
         )
    )`;
  };

  for (const name of input.ingredients ?? []) {
    conditions.push(ingredientClause(name));
  }
  for (const name of input.excludeIngredients ?? []) {
    conditions.push(sql`NOT ${ingredientClause(name)}`);
  }

  const where = sql.join(conditions, sql` AND `);

  // A bare integer in ORDER BY is an ordinal position in Postgres, so the
  // no-query case must drop the rank term from the ordering entirely rather
  // than ordering by a constant `0` — which fails with "ORDER BY position 0
  // is not in select list".
  const trimmedQuery = input.query?.trim();
  const rank = trimmedQuery
    ? sql`ts_rank_cd(r.search_vector, websearch_to_tsquery('english', ${trimmedQuery}))`
    : sql`0::float4`;
  const ordering = trimmedQuery
    ? sql`${rank} DESC, r.updated_at DESC`
    : sql`r.updated_at DESC`;

  const result = await db.execute<{
    id: string;
    slug: string;
    title: string;
    subtitle: string | null;
    summary: string | null;
    kind: string;
    hero_image_url: string | null;
    hero_image_alt: string | null;
    updated_at: Date;
    revision_number: number | null;
    rank: number;
    total: number;
  }>(sql`
    SELECT r.id, r.slug, r.title, r.subtitle, r.summary, r.kind,
           r.hero_image_url, r.hero_image_alt, r.updated_at,
           rev.revision_number,
           ${rank} AS rank,
           COUNT(*) OVER () AS total
      FROM recipes_live r
      LEFT JOIN recipe_revisions_live rev ON rev.id = r.current_revision_id
     WHERE ${where}
     ORDER BY ${ordering}
     LIMIT ${input.limit ?? 20}
    OFFSET ${input.offset ?? 0}
  `);

  const list = result.rows as unknown as {
    id: string;
    slug: string;
    title: string;
    subtitle: string | null;
    summary: string | null;
    kind: string;
    hero_image_url: string | null;
    hero_image_alt: string | null;
    updated_at: string | Date;
    revision_number: number | null;
    rank: number | string;
    total: number | string;
  }[];

  const terms = await attachTerms(list);
  return {
    total: list.length > 0 ? Number(list[0]!.total) : 0,
    results: list.map((r) => ({
      ...toSummary(
        {
          id: r.id,
          slug: r.slug,
          title: r.title,
          subtitle: r.subtitle,
          summary: r.summary,
          kind: r.kind,
          heroImageUrl: r.hero_image_url,
          heroImageAlt: r.hero_image_alt,
          updatedAt: new Date(r.updated_at),
          revisionNumber: r.revision_number,
        },
        terms.get(r.id) ?? [],
      ),
      rank: Number(r.rank),
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// A single recipe
// ─────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────
// The mass flow figure — R-SCR-39, D-12
// ─────────────────────────────────────────────────────────────────────────

/** A number the design's way: a real minus sign, not a hyphen. */
function figure(value: number): string {
  return String(value).replace('-', '\u2212');
}

/**
 * Largest first. A stage picks the largest of these that leaves every end
 * of its range a whole number.
 */
const STAGE_TIME_UNITS = [
  { minutes: 1440, label: 'd' },
  { minutes: 60, label: 'h' },
  { minutes: 1, label: 'min' },
];

/**
 * A wait, as the strip draws it: `45 min`, `24–48 h`, `13–15 d`.
 *
 * One unit for the whole range rather than one for each end — the figure
 * reads `24–48 h`, not `24 h–48 h` — and the unit steps down when the near
 * end would read as `1`. A cure of 1440 to 2880 minutes is `24–48 h` and
 * not `1–2 d`, because the reader is comparing the two ends and `1–2` hides
 * how much longer the far one is. This is why the column is minutes with no
 * unit beside it: the drawing decides, and the store does not have to.
 */
function formatStageDuration(minutes: number, max: number | null): string {
  const ends = max == null || max === minutes ? [minutes] : [minutes, max];
  const whole = STAGE_TIME_UNITS.filter((u) =>
    ends.every((m) => m % u.minutes === 0),
  );
  // `min` divides everything, so this is never empty.
  let unit = whole[0]!;
  if (ends.length > 1 && minutes / unit.minutes === 1 && whole[1]) {
    unit = whole[1];
  }
  return `${ends.map((m) => m / unit.minutes).join('\u2013')} ${unit.label}`;
}

/**
 * A stage's figure. One value line per stage — a weight, a count or a wait
 * — and `raw_text` only when the row holds neither, which is what the
 * `mass_flow_stage_single_figure` check makes true.
 */
function formatStageValue(row: {
  quantity: string | null;
  quantityMax: string | null;
  unit: string | null;
  durationMinutes: number | null;
  durationMaxMinutes: number | null;
  rawText: string | null;
}): string | null {
  const quantity = n(row.quantity);
  if (quantity != null) {
    const amount = formatQuantity(quantity, n(row.quantityMax));
    if (!row.unit || amount == null) return amount;
    return `${amount} ${pluraliseUnit(row.unit, n(row.quantityMax) ?? quantity)}`;
  }
  if (row.durationMinutes != null) {
    return formatStageDuration(row.durationMinutes, row.durationMaxMinutes);
  }
  return row.rawText;
}

/**
 * The two summary figures, as separate values.
 *
 * The word follows the sign, because R-SCR-39 covers a dish that gains
 * weight as well as one that loses it, and a brine drawn as a "loss" of
 * -12% would be read backwards.
 */
function formatMassFlowSummary(
  netChangePercent: number | null,
  ratePercentPerDay: number | null,
): string[] {
  const summary: string[] = [];
  if (netChangePercent != null) {
    const word =
      netChangePercent < 0 ? 'loss' : netChangePercent > 0 ? 'gain' : 'change';
    const sign = netChangePercent > 0 ? '+' : '';
    summary.push(`Net weight ${word} ${sign}${figure(netChangePercent)}%`);
  }
  if (ratePercentPerDay != null) {
    summary.push(`Rate ${figure(ratePercentPerDay)}% per day`);
  }
  return summary;
}

export async function getRecipeBySlug(
  slug: string,
  revisionNumber?: number,
): Promise<RecipeView | null> {
  const found = await db
    .select({
      id: recipesLive.id,
      slug: recipesLive.slug,
      title: recipesLive.title,
      subtitle: recipesLive.subtitle,
      summary: recipesLive.summary,
      kind: recipesLive.kind,
      status: recipesLive.status,
      heroImageUrl: recipesLive.heroImageUrl,
      heroImageAlt: recipesLive.heroImageAlt,
      originNote: recipesLive.originNote,
      currentRevisionId: recipesLive.currentRevisionId,
      createdAt: recipesLive.createdAt,
      updatedAt: recipesLive.updatedAt,
    })
    .from(recipesLive)
    .where(eq(recipesLive.slug, slug))
    .limit(1);

  const recipe = found[0];
  if (!recipe) return null;

  // Newest first by when the version existed, not by when the row was
  // written. A revision backfilled today can describe a recipe from years
  // ago, and listing it at the top would make the history read backwards.
  // The revision number breaks ties and keeps the order stable.
  const revisionRows = await db
    .select()
    .from(recipeRevisionsLive)
    .where(eq(recipeRevisionsLive.recipeId, recipe.id))
    .orderBy(
      desc(
        sql`COALESCE(${recipeRevisionsLive.occurredAt}, ${recipeRevisionsLive.createdAt})`,
      ),
      desc(recipeRevisionsLive.revisionNumber),
    );

  const revision =
    revisionNumber != null
      ? revisionRows.find((r) => r.revisionNumber === revisionNumber)
      : (revisionRows.find((r) => r.id === recipe.currentRevisionId) ??
        revisionRows[0]);
  if (!revision) return null;

  const [ingredientRows, stepRows, noteRows, massFlowRows, termMap] =
    await Promise.all([
      db
        .select({
          id: recipeIngredients.id,
          position: recipeIngredients.position,
          component: recipeIngredients.component,
          quantity: recipeIngredients.quantity,
          quantityMax: recipeIngredients.quantityMax,
          unit: recipeIngredients.unit,
          preparation: recipeIngredients.preparation,
          optional: recipeIngredients.optional,
          note: recipeIngredients.note,
          rawText: recipeIngredients.rawText,
          ingredientSlug: ingredientsLive.slug,
          ingredientName: ingredientsLive.name,
          ingredientCategory: ingredientsLive.category,
        })
        .from(recipeIngredients)
        .leftJoin(
          ingredientsLive,
          eq(ingredientsLive.id, recipeIngredients.ingredientId),
        )
        .where(eq(recipeIngredients.revisionId, revision.id))
        .orderBy(asc(recipeIngredients.position)),
      db
        .select({
          id: recipeSteps.id,
          position: recipeSteps.position,
          phase: recipeSteps.phase,
          instruction: recipeSteps.instruction,
          durationMinutes: recipeSteps.durationMinutes,
          durationMaxMinutes: recipeSteps.durationMaxMinutes,
          temperatureC: recipeSteps.temperatureC,
          equipment: recipeSteps.equipment,
          imageUrl: recipeSteps.imageUrl,
          imageAlt: recipeSteps.imageAlt,
          note: recipeSteps.note,
          techniqueSlug: taxonomyTermsLive.slug,
          techniqueLabel: taxonomyTermsLive.label,
        })
        .from(recipeSteps)
        .leftJoin(
          taxonomyTermsLive,
          eq(taxonomyTermsLive.id, recipeSteps.techniqueTermId),
        )
        .where(eq(recipeSteps.revisionId, revision.id))
        .orderBy(asc(recipeSteps.position)),
      // Notes on the recipe itself and on the revision being displayed.
      db
        .select({
          id: notesLive.id,
          kind: notesLive.kind,
          title: notesLive.title,
          body: notesLive.body,
          conditions: notesLive.conditions,
          createdAt: notesLive.createdAt,
        })
        .from(notesLive)
        .where(
          sql`${notesLive.recipeId} = ${recipe.id} OR ${notesLive.revisionId} = ${revision.id}`,
        )
        // THE NOTE ORDER. `created_at` first, `position` second, `id` last —
        // the same three columns in the same order in all five reads that
        // return notes, so a note holds one place in one list wherever it is
        // drawn.
        //
        // `created_at` defaults to `now()`, which Postgres holds fixed for a
        // transaction, so every note written by one call carries the SAME
        // timestamp. It sequences the *groups* exactly — one transaction
        // only ever writes notes against one subject, and this query reads
        // two of them, the recipe's and the current revision's — and it
        // cannot sequence within a group at all. `notes.position` does that;
        // it is a 1-based ordinal within the subject, written by
        // `writeNotes`. Before it, the tiebreak was `asc(notes.id)`, a random
        // uuid, so the Wellington's four mechanisms were renumbered on every
        // ingest. `id` stays on the end so the sort is total.
        .orderBy(
          asc(notesLive.createdAt),
          asc(notesLive.position),
          asc(notesLive.id),
        ),
      // One flow at most — `uq_mass_flow_revision` — so the head repeats on
      // every stage row and a left join costs one statement instead of two.
      db
        .select({
          netChangePercent: recipeMassFlows.netChangePercent,
          ratePercentPerDay: recipeMassFlows.ratePercentPerDay,
          note: recipeMassFlows.note,
          label: recipeMassFlowStages.label,
          quantity: recipeMassFlowStages.quantity,
          quantityMax: recipeMassFlowStages.quantityMax,
          unit: recipeMassFlowStages.unit,
          durationMinutes: recipeMassFlowStages.durationMinutes,
          durationMaxMinutes: recipeMassFlowStages.durationMaxMinutes,
          emphasis: recipeMassFlowStages.emphasis,
          rawText: recipeMassFlowStages.rawText,
        })
        .from(recipeMassFlows)
        .leftJoin(
          recipeMassFlowStages,
          eq(recipeMassFlowStages.massFlowId, recipeMassFlows.id),
        )
        .where(eq(recipeMassFlows.revisionId, revision.id))
        .orderBy(asc(recipeMassFlowStages.position)),
      attachTerms([{ id: recipe.id }]),
    ]);

  const massFlowHead = massFlowRows[0];
  const massFlowStages: MassFlowStageView[] = massFlowRows
    .filter((row) => row.label !== null)
    .map((row) => ({
      label: row.label!,
      value: formatStageValue(row),
      emphasis: row.emphasis!,
    }));

  const stepUses = stepRows.length
    ? await db
        .select({
          stepId: recipeStepIngredients.stepId,
          recipeIngredientId: recipeStepIngredients.recipeIngredientId,
          name: sql<string>`COALESCE(${ingredientsLive.name}, ${recipeIngredients.rawText})`,
        })
        .from(recipeStepIngredients)
        .innerJoin(
          recipeIngredients,
          eq(recipeIngredients.id, recipeStepIngredients.recipeIngredientId),
        )
        .leftJoin(
          ingredientsLive,
          eq(ingredientsLive.id, recipeIngredients.ingredientId),
        )
        .where(
          inArray(
            recipeStepIngredients.stepId,
            stepRows.map((s) => s.id),
          ),
        )
    : [];

  const usesByStep = new Map<
    string,
    { recipeIngredientId: string; name: string }[]
  >();
  for (const row of stepUses) {
    const list = usesByStep.get(row.stepId) ?? [];
    list.push({ recipeIngredientId: row.recipeIngredientId, name: row.name });
    usesByStep.set(row.stepId, list);
  }

  const sourceRows = noteRows.length
    ? await db
        .select()
        .from(noteSources)
        .where(
          inArray(
            noteSources.noteId,
            noteRows.map((x) => x.id),
          ),
        )
        // This read had no ORDER BY at all, so the citations under a note
        // came back in whatever order the scan produced — visible on the
        // recipe page and, worse, in `pnpm export`, where a `- Source:`
        // block reshuffled between two loads of the same seed. Same three
        // columns as everywhere else; the grouping below preserves them.
        .orderBy(
          asc(noteSources.createdAt),
          asc(noteSources.position),
          asc(noteSources.id),
        )
    : [];
  const sourcesByNote = new Map<string, NoteView['sources']>();
  for (const row of sourceRows) {
    const list = sourcesByNote.get(row.noteId) ?? [];
    list.push({
      url: row.url,
      title: row.title,
      citation: row.citation,
      accessedAt: row.accessedAt,
    });
    sourcesByNote.set(row.noteId, list);
  }

  const [linkRows, backlinkRows, experimentRows] = await Promise.all([
    db
      .select({
        linkKind: recipeLinks.kind,
        linkNote: recipeLinks.note,
        ...recipeSummaryColumns,
      })
      .from(recipeLinks)
      .innerJoin(recipesLive, eq(recipesLive.id, recipeLinks.toRecipeId))
      .leftJoin(
        recipeRevisionsLive,
        eq(recipeRevisionsLive.id, recipesLive.currentRevisionId),
      )
      .where(eq(recipeLinks.fromRecipeId, recipe.id)),
    db
      .select({ linkKind: recipeLinks.kind, ...recipeSummaryColumns })
      .from(recipeLinks)
      .innerJoin(recipesLive, eq(recipesLive.id, recipeLinks.fromRecipeId))
      .leftJoin(
        recipeRevisionsLive,
        eq(recipeRevisionsLive.id, recipesLive.currentRevisionId),
      )
      .where(eq(recipeLinks.toRecipeId, recipe.id)),
    db
      .select({
        slug: experimentsLive.slug,
        title: experimentsLive.title,
        startedAt: experimentsLive.startedAt,
      })
      .from(experimentsLive)
      .where(eq(experimentsLive.recipeId, recipe.id))
      .orderBy(desc(experimentsLive.startedAt)),
  ]);

  const linkedTerms = await attachTerms([...linkRows, ...backlinkRows]);

  return {
    id: recipe.id,
    slug: recipe.slug,
    title: recipe.title,
    subtitle: recipe.subtitle,
    summary: recipe.summary,
    kind: recipe.kind,
    heroImageUrl: recipe.heroImageUrl,
    heroImageAlt: recipe.heroImageAlt,
    originNote: recipe.originNote,
    createdAt: recipe.createdAt.toISOString(),
    updatedAt: recipe.updatedAt.toISOString(),
    revisionNumber: revision.revisionNumber,
    terms: termMap.get(recipe.id) ?? [],
    revision: {
      id: revision.id,
      revisionNumber: revision.revisionNumber,
      title: revision.title,
      summary: revision.summary,
      rationale: revision.rationale,
      yieldQuantity: n(revision.yieldQuantity),
      yieldUnit: revision.yieldUnit,
      servings: revision.servings,
      totalTimeMinutes: revision.totalTimeMinutes,
      activeTimeMinutes: revision.activeTimeMinutes,
      // Null rather than an empty array when there is no figure, so a
      // caller reads "this revision has none" rather than "it has one with
      // nothing in it". R-SCR-39 makes absence the ordinary case.
      massFlow: massFlowStages.length > 0 ? massFlowStages : null,
      massFlowSummary: massFlowHead
        ? formatMassFlowSummary(
            n(massFlowHead.netChangePercent),
            n(massFlowHead.ratePercentPerDay),
          )
        : [],
      massFlowNote: massFlowHead?.note ?? null,
      source: revision.source,
      createdAt: revision.createdAt.toISOString(),
    },
    ingredients: ingredientRows.map((row) => ({
      id: row.id,
      position: row.position,
      component: row.component,
      quantity: n(row.quantity),
      quantityMax: n(row.quantityMax),
      unit: row.unit,
      preparation: row.preparation,
      optional: row.optional,
      note: row.note,
      rawText: row.rawText,
      ingredient: row.ingredientSlug
        ? {
            slug: row.ingredientSlug,
            name: row.ingredientName!,
            category: row.ingredientCategory!,
          }
        : null,
    })),
    steps: stepRows.map((row) => ({
      id: row.id,
      position: row.position,
      phase: row.phase,
      instruction: row.instruction,
      durationMinutes: row.durationMinutes,
      durationMaxMinutes: row.durationMaxMinutes,
      temperatureC: n(row.temperatureC),
      equipment: row.equipment,
      imageUrl: row.imageUrl,
      imageAlt: row.imageAlt,
      technique: row.techniqueSlug
        ? { slug: row.techniqueSlug, label: row.techniqueLabel! }
        : null,
      note: row.note,
      uses: usesByStep.get(row.id) ?? [],
    })),
    notes: noteRows.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      conditions: row.conditions,
      createdAt: row.createdAt.toISOString(),
      sources: sourcesByNote.get(row.id) ?? [],
    })),
    revisions: revisionRows.map((r) => ({
      revisionNumber: r.revisionNumber,
      rationale: r.rationale,
      source: r.source,
      createdAt: r.createdAt.toISOString(),
      occurredAt: r.occurredAt ? r.occurredAt.toISOString() : null,
      /**
       * R-SCR-08's badge reads "Recorded later — written down <date>", so it
       * may only be set when the version existed BEFORE the row was written.
       *
       * `occurred_at IS NOT NULL` used to be the same statement, because
       * `backfillRevision` was its only writer and it refuses a date that is
       * not older than everything stored. `update_revision` writes the
       * column too, and its `occurredAt` is unconstrained, so a correction
       * could put a date on or after `created_at` and make the page assert
       * that a version was recorded later than a day it had already been
       * recorded on. The relation the badge claims is asked for directly.
       */
      backfilled: r.occurredAt !== null && r.occurredAt < r.createdAt,
    })),
    links: linkRows.map((row) => ({
      kind: row.linkKind,
      note: row.linkNote,
      recipe: toSummary(row, linkedTerms.get(row.id) ?? []),
    })),
    backlinks: backlinkRows.map((row) => ({
      kind: row.linkKind,
      recipe: toSummary(row, linkedTerms.get(row.id) ?? []),
    })),
    experiments: experimentRows,
  };
}

/**
 * Does this recipe exist, and what is it called.
 *
 * One statement, two columns. `getRecipeBySlug` answers the same question
 * but issues about twelve — the revisions, the ingredients, the steps, the
 * notes, their sources, the step uses, the links, the backlinks, the runs
 * and the terms twice — and a page that draws a heading and a grid of runs
 * should not pay for all of it, least of all on a `force-dynamic` route
 * that reads once in `generateMetadata` and again in the page.
 *
 * There is no status filter, matching `getRecipeBySlug`: an archived recipe
 * still answers at its own address.
 */
export async function getRecipeIdentity(slug: string): Promise<{
  slug: string;
  title: string;
  /**
   * The number of the revision `recipes.current_revision_id` points at.
   * NOT `MAX(revision_number)`: a backfilled revision carries a later number
   * and an earlier date, so the highest number is not the current one.
   * `null` when the recipe has no current revision recorded.
   *
   * Added for `src/app/@foot/recipes/[slug]/page.tsx`, whose left slot is
   * the design's `EFFECTIVITY: SIXTH REVISION AND ON`. A page foot must not
   * pay for `getRecipeBySlug`, which reads eleven tables.
   */
  revisionNumber: number | null;
} | null> {
  const rows = await db
    .select({
      slug: recipesLive.slug,
      title: recipesLive.title,
      revisionNumber: recipeRevisionsLive.revisionNumber,
    })
    .from(recipesLive)
    .leftJoin(
      recipeRevisionsLive,
      eq(recipeRevisionsLive.id, recipesLive.currentRevisionId),
    )
    .where(eq(recipesLive.slug, slug))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    slug: row.slug,
    title: row.title,
    revisionNumber: row.revisionNumber ?? null,
  };
}

export async function listRecipeSlugs(): Promise<string[]> {
  const rows = await db
    .select({ slug: recipesLive.slug })
    .from(recipesLive)
    .where(eq(recipesLive.status, 'active'))
    // `pnpm export` walks this list and writes content/generated/README.md
    // from it in order. With no ORDER BY the index reshuffled between two
    // loads of one seed even when every recipe in it was identical.
    .orderBy(asc(recipesLive.slug));
  return rows.map((r) => r.slug);
}

// ─────────────────────────────────────────────────────────────────────────
// Taxonomy
// ─────────────────────────────────────────────────────────────────────────

export interface TermWithCount extends TermView {
  recipeCount: number;
  /**
   * The broader tag this one sits under, or `null` at the top level.
   *
   * A parent is always in the same category type, so it carries no type of
   * its own. It is here because it was readable nowhere else: `getTerm`
   * returns it for one tag at a time and the MCP registry exposes no tool
   * that calls `getTerm`, so `list_categories` was the only view an agent
   * had of the categories and it showed a flat list. A hierarchy that can
   * be written and not read is a hierarchy nobody can check.
   */
  parent: { slug: string; label: string } | null;
}

export async function listCategories(
  facet?: CategoryType,
): Promise<TermWithCount[]> {
  // A term has at most one parent, so this join adds no rows and the
  // COUNT below still counts recipes.
  // `alias()` takes a view as well as a table — `PgTable | PgViewBase` — so
  // the parent join filters too. A tag whose parent was deleted then reads
  // as `parent: null`, which is the right degradation: the tag is still
  // there and no longer claims to sit under something nobody can open.
  const parentTerm = alias(taxonomyTermsLive, 'parent_term');

  const rows = await db
    .select({
      id: taxonomyTermsLive.id,
      facet: taxonomyTermsLive.facet,
      slug: taxonomyTermsLive.slug,
      label: taxonomyTermsLive.label,
      description: taxonomyTermsLive.description,
      parentSlug: parentTerm.slug,
      parentLabel: parentTerm.label,
      recipeCount: sql<number>`COUNT(${recipeTerms.recipeId})`,
    })
    .from(taxonomyTermsLive)
    .leftJoin(parentTerm, eq(parentTerm.id, taxonomyTermsLive.parentId))
    .leftJoin(recipeTerms, eq(recipeTerms.termId, taxonomyTermsLive.id))
    .where(facet ? eq(taxonomyTermsLive.facet, facet) : sql`true`)
    .groupBy(
      taxonomyTermsLive.id,
      taxonomyTermsLive.facet,
      taxonomyTermsLive.slug,
      taxonomyTermsLive.label,
      taxonomyTermsLive.description,
      parentTerm.slug,
      parentTerm.label,
    )
    .orderBy(
      desc(sql`COUNT(${recipeTerms.recipeId})`),
      asc(taxonomyTermsLive.label),
    );

  return rows.map((r) => ({
    id: r.id,
    categoryType: r.facet as CategoryType,
    slug: r.slug,
    label: r.label,
    description: r.description,
    parent:
      r.parentSlug && r.parentLabel
        ? { slug: r.parentSlug, label: r.parentLabel }
        : null,
    recipeCount: Number(r.recipeCount),
  }));
}

export async function getTerm(
  facet: CategoryType,
  slug: string,
): Promise<{
  term: TermView;
  /** The broader term this one sits under, e.g. Cajun → American. */
  parent: TermView | null;
  /** Narrower terms under this one. */
  children: TermView[];
  recipes: RecipeSummaryView[];
} | null> {
  const found = await db
    .select()
    .from(taxonomyTermsLive)
    .where(
      and(eq(taxonomyTermsLive.facet, facet), eq(taxonomyTermsLive.slug, slug)),
    )
    .limit(1);
  const term = found[0];
  if (!term) return null;

  const rows = await db
    .select(recipeSummaryColumns)
    .from(recipeTerms)
    .innerJoin(recipesLive, eq(recipesLive.id, recipeTerms.recipeId))
    .leftJoin(
      recipeRevisionsLive,
      eq(recipeRevisionsLive.id, recipesLive.currentRevisionId),
    )
    .where(
      and(eq(recipeTerms.termId, term.id), eq(recipesLive.status, 'active')),
    )
    .orderBy(desc(recipesLive.updatedAt));

  const terms = await attachTerms(rows);

  const toTermView = (row: {
    id: string;
    facet: string;
    slug: string;
    label: string;
    description: string | null;
  }): TermView => ({
    id: row.id,
    categoryType: row.facet as CategoryType,
    slug: row.slug,
    label: row.label,
    description: row.description,
  });

  const parentRows = term.parentId
    ? await db
        .select()
        .from(taxonomyTermsLive)
        .where(eq(taxonomyTermsLive.id, term.parentId))
        .limit(1)
    : [];

  const childRows = await db
    .select()
    .from(taxonomyTermsLive)
    .where(eq(taxonomyTermsLive.parentId, term.id))
    .orderBy(taxonomyTermsLive.label);

  return {
    term: toTermView(term),
    parent: parentRows[0] ? toTermView(parentRows[0]) : null,
    children: childRows.map(toTermView),
    recipes: rows.map((r) => toSummary(r, terms.get(r.id) ?? [])),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Ingredients
// ─────────────────────────────────────────────────────────────────────────

export interface IngredientWithUsage {
  slug: string;
  name: string;
  plural: string | null;
  category: string;
  description: string | null;
  densityGPerMl: number | null;
  defaultUnit: string | null;
  aliases: string[];
  recipeCount: number;
}

export async function listIngredients(): Promise<IngredientWithUsage[]> {
  const rows = await db
    .select({
      slug: ingredientsLive.slug,
      name: ingredientsLive.name,
      plural: ingredientsLive.plural,
      category: ingredientsLive.category,
      description: ingredientsLive.description,
      densityGPerMl: ingredientsLive.densityGPerMl,
      defaultUnit: ingredientsLive.defaultUnit,
      aliases: ingredientsLive.aliases,
      recipeCount: sql<number>`COUNT(DISTINCT r.id)`,
    })
    .from(ingredientsLive)
    .leftJoin(
      sql`recipe_ingredients ri`,
      sql`ri.ingredient_id = ${ingredientsLive.id}`,
    )
    .leftJoin(
      sql`recipes_live r`,
      sql`r.current_revision_id = ri.revision_id AND r.status = 'active'`,
    )
    .groupBy(
      ingredientsLive.id,
      ingredientsLive.slug,
      ingredientsLive.name,
      ingredientsLive.plural,
      ingredientsLive.category,
      ingredientsLive.description,
      ingredientsLive.densityGPerMl,
      ingredientsLive.defaultUnit,
      ingredientsLive.aliases,
    )
    .orderBy(desc(sql`COUNT(DISTINCT r.id)`), asc(ingredientsLive.name));

  return rows.map((r) => ({
    ...r,
    densityGPerMl: n(r.densityGPerMl),
    recipeCount: Number(r.recipeCount),
  }));
}

export async function getIngredient(slug: string): Promise<{
  ingredient: IngredientWithUsage;
  recipes: RecipeSummaryView[];
  substitutes: { slug: string; name: string; note: string | null }[];
  notes: NoteView[];
} | null> {
  const found = await db
    .select()
    .from(ingredientsLive)
    .where(eq(ingredientsLive.slug, slug))
    .limit(1);
  const row = found[0];
  if (!row) return null;

  const [usedIn, subs, noteRows] = await Promise.all([
    db
      .select(recipeSummaryColumns)
      .from(recipeIngredients)
      .innerJoin(
        recipesLive,
        eq(recipesLive.currentRevisionId, recipeIngredients.revisionId),
      )
      .leftJoin(
        recipeRevisionsLive,
        eq(recipeRevisionsLive.id, recipesLive.currentRevisionId),
      )
      .where(
        and(
          eq(recipeIngredients.ingredientId, row.id),
          eq(recipesLive.status, 'active'),
        ),
      )
      .groupBy(
        recipesLive.id,
        recipesLive.slug,
        recipesLive.title,
        recipesLive.subtitle,
        recipesLive.summary,
        recipesLive.kind,
        recipesLive.heroImageUrl,
        recipesLive.heroImageAlt,
        recipesLive.updatedAt,
        recipeRevisionsLive.revisionNumber,
      )
      .orderBy(desc(recipesLive.updatedAt)),
    db
      .select({
        slug: ingredientsLive.slug,
        name: ingredientsLive.name,
        note: ingredientRelations.note,
      })
      .from(ingredientRelations)
      .innerJoin(
        ingredientsLive,
        eq(ingredientsLive.id, ingredientRelations.toIngredientId),
      )
      .where(
        and(
          eq(ingredientRelations.fromIngredientId, row.id),
          eq(ingredientRelations.kind, 'substitute'),
        ),
      ),
    db
      .select({
        id: notesLive.id,
        kind: notesLive.kind,
        title: notesLive.title,
        body: notesLive.body,
        conditions: notesLive.conditions,
        createdAt: notesLive.createdAt,
      })
      .from(notesLive)
      .where(eq(notesLive.ingredientId, row.id))
      // The note order — see `getRecipeBySlug`. `created_at` alone left
      // several notes written against one ingredient in planner order.
      .orderBy(
        asc(notesLive.createdAt),
        asc(notesLive.position),
        asc(notesLive.id),
      ),
  ]);

  const terms = await attachTerms(usedIn);

  return {
    ingredient: {
      slug: row.slug,
      name: row.name,
      plural: row.plural,
      category: row.category,
      description: row.description,
      densityGPerMl: n(row.densityGPerMl),
      defaultUnit: row.defaultUnit,
      aliases: row.aliases,
      recipeCount: usedIn.length,
    },
    recipes: usedIn.map((r) => toSummary(r, terms.get(r.id) ?? [])),
    substitutes: subs,
    notes: noteRows.map((x) => ({
      id: x.id,
      kind: x.kind,
      title: x.title,
      body: x.body,
      conditions: x.conditions,
      createdAt: x.createdAt.toISOString(),
      sources: [],
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Experiments
// ─────────────────────────────────────────────────────────────────────────

export interface ExperimentView {
  slug: string;
  title: string;
  summary: string | null;
  startedAt: string | null;
  completedAt: string | null;
  scaleFactor: number | null;
  outcome: string | null;
  costTotal: number | null;
  currency: string | null;
  /** The revision this run was cooking, when the run named one. */
  revisionNumber: number | null;
  /**
   * True when that revision has since been deleted — §4.3.
   *
   * The run is not deleted with it and must not read as though it cooked
   * nothing. The number stays, and the reader is told the version is gone.
   * A hard delete would have fired `experiments.revision_id`'s
   * `ON DELETE SET NULL` and left the run saying "no version recorded",
   * which is a false statement about a run that recorded one.
   */
  revisionWithdrawn: boolean;
  recipe: { slug: string; title: string } | null;
  items: { label: string; note: string | null }[];
  observations: {
    item: string | null;
    metric: string;
    value: number | null;
    unit: string | null;
    recordedAt: string | null;
    note: string | null;
  }[];
  notes: NoteView[];
}

/**
 * One row of a batch-log index.
 *
 * It is NOT a thinner `ExperimentView`: the two indexes draw figures that
 * the detail view computes from `observations`, and a list of six runs must
 * not read every observation of every one of them to do it. `raw` and
 * `finished` are the SUMS, made in `experimentWeights` below.
 */
export interface ExperimentSummary {
  slug: string;
  title: string;
  summary: string | null;
  startedAt: string | null;
  /** `experimentsLive.cost_total`, and the currency it was recorded in. */
  costTotal: number | null;
  currency: string | null;
  /** The revision this run was cooking, when the run named one. */
  revisionNumber: number | null;
  /** True when that revision has since been deleted — §4.3, `ExperimentView`. */
  revisionWithdrawn: boolean;
  /** What went in, summed, in the unit it was recorded in. */
  raw: { value: number; unit: string } | null;
  /** What came out. `null` when the run never weighed anything out. */
  finished: { value: number; unit: string } | null;
  recipe: { slug: string; title: string } | null;
}

/**
 * Every recorded run, or one recipe's.
 *
 * `/batch-logs` lists them all and calls this with nothing;
 * `/recipes/[slug]/batch-logs` is the same grid filtered to one recipe. The
 * filter is optional so the existing no-argument call sites keep working
 * unchanged, including `safeRead(listExperiments, [])`.
 *
 * The join stays a left join and the filter is a `WHERE` on the joined
 * recipe, so an unfiltered call still lists a run that names no recipe with
 * a null `recipe` (K-01, R-SCR-44) while a filtered call sees only the runs
 * of the recipe asked for.
 */
export async function listExperiments(options?: {
  recipeSlug?: string;
}): Promise<ExperimentSummary[]> {
  const rows = await db
    .select({
      id: experimentsLive.id,
      slug: experimentsLive.slug,
      title: experimentsLive.title,
      summary: experimentsLive.summary,
      startedAt: experimentsLive.startedAt,
      costTotal: experimentsLive.costTotal,
      currency: experimentsLive.currency,
      revisionNumber: recipeRevisionsAll.revisionNumber,
      // THE ONE JOIN IN THIS FILE THAT READS A DELETED ROW ON PURPOSE.
      // See `recipeRevisionsAll` in `./live` and §4.3: a run outlives the
      // version it cooked, so the number stays readable and the run says
      // the version was withdrawn.
      revisionWithdrawn: sql<boolean>`${recipeRevisionsAll.deletedAt} IS NOT NULL`,
      recipeSlug: recipesLive.slug,
      recipeTitle: recipesLive.title,
    })
    .from(experimentsLive)
    .leftJoin(recipesLive, eq(recipesLive.id, experimentsLive.recipeId))
    .leftJoin(
      recipeRevisionsAll,
      eq(recipeRevisionsAll.id, experimentsLive.revisionId),
    )
    .where(
      options?.recipeSlug
        ? eq(recipesLive.slug, options.recipeSlug)
        : undefined,
    )
    // Newest first. The slug breaks the tie, because two runs started on
    // the same day are otherwise ordered by whatever the planner returns
    // and the grid reshuffles between renders.
    .orderBy(desc(experimentsLive.startedAt), asc(experimentsLive.slug));

  const weights = await experimentWeights(rows.map((r) => r.id));

  return rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    summary: r.summary,
    startedAt: r.startedAt,
    costTotal: n(r.costTotal),
    currency: r.currency,
    revisionNumber: r.revisionNumber ?? null,
    revisionWithdrawn: r.revisionWithdrawn ?? false,
    raw: weights.get(r.id)?.raw ?? null,
    finished: weights.get(r.id)?.finished ?? null,
    recipe: r.recipeSlug ? { slug: r.recipeSlug, title: r.recipeTitle! } : null,
  }));
}

/**
 * The metric that means "what went in", in the order it is preferred, and
 * the one that means "what came out".
 *
 * `net_weight` first because it is the meat after the hook is subtracted,
 * which is what every yield in the archive is computed against; the other
 * two are what a run records when it never weighed a hook. FINISHED is
 * `final_weight` ONLY — `expected_dried_weight` is net times 0.45 and a
 * projection has no business being summed into a ledger of measurements.
 *
 * `src/app/batch-logs/batch-log-detail.tsx` states the same two lists for
 * the figures on one run's own page and must not disagree with these.
 */
const RAW_METRICS = ['net_weight', 'initial_weight', 'gross_weight'] as const;
const FINISHED_METRICS = ['final_weight'] as const;

/**
 * `RAW` and `DRIED` for a page of runs, in ONE query.
 *
 * The design draws a `RAW / DRIED / YIELD` panel on every row of both batch
 * log indexes (`png/QqY5h.png`, `png/u7aBZ.png`) and the meta line under
 * each summary carries `PER KG FINISHED`, which is the cost over the same
 * dried figure. Both are sums over `experiment_observations`, so the index
 * has to read them — one grouped aggregate over the runs already listed,
 * not a per-row query.
 *
 * A SUM ACROSS TWO UNITS IS A NUMBER WITH NO MEANING, so the group is by
 * unit as well and a metric recorded in two units is dropped rather than
 * added up. R-STA-05 does the rest: a run that never weighed anything out
 * has no DRIED and therefore no YIELD, and its panel draws what it has.
 */
async function experimentWeights(ids: string[]): Promise<
  Map<
    string,
    {
      raw: { value: number; unit: string } | null;
      finished: { value: number; unit: string } | null;
    }
  >
> {
  const out = new Map<
    string,
    {
      raw: { value: number; unit: string } | null;
      finished: { value: number; unit: string } | null;
    }
  >();
  if (ids.length === 0) return out;

  const rows = await db
    .select({
      experimentId: experimentObservations.experimentId,
      metric: experimentObservations.metric,
      unit: experimentObservations.unit,
      total: sql<string>`sum(${experimentObservations.value})`,
    })
    .from(experimentObservations)
    .where(
      and(
        inArray(experimentObservations.experimentId, ids),
        inArray(experimentObservations.metric, [
          ...RAW_METRICS,
          ...FINISHED_METRICS,
        ]),
        sql`${experimentObservations.value} is not null`,
      ),
    )
    .groupBy(
      experimentObservations.experimentId,
      experimentObservations.metric,
      experimentObservations.unit,
    );

  /* metric → the units it was recorded in, per run. Two units means the
     metric is unusable, not that one of them wins. */
  const byRun = new Map<
    string,
    Map<string, { value: number; unit: string }[]>
  >();
  for (const row of rows) {
    const perMetric = byRun.get(row.experimentId) ?? new Map();
    const list = perMetric.get(row.metric) ?? [];
    list.push({ value: n(row.total) ?? 0, unit: row.unit ?? '' });
    perMetric.set(row.metric, list);
    byRun.set(row.experimentId, perMetric);
  }

  const pick = (
    perMetric: Map<string, { value: number; unit: string }[]>,
    metrics: readonly string[],
  ) => {
    for (const metric of metrics) {
      const list = perMetric.get(metric);
      if (!list || list.length === 0) continue;
      if (list.length > 1) return null;
      return list[0]!;
    }
    return null;
  };

  for (const id of ids) {
    const perMetric = byRun.get(id);
    out.set(id, {
      raw: perMetric ? pick(perMetric, RAW_METRICS) : null,
      finished: perMetric ? pick(perMetric, FINISHED_METRICS) : null,
    });
  }
  return out;
}

export async function getExperiment(
  slug: string,
): Promise<ExperimentView | null> {
  const found = await db
    .select({
      id: experimentsLive.id,
      slug: experimentsLive.slug,
      title: experimentsLive.title,
      summary: experimentsLive.summary,
      startedAt: experimentsLive.startedAt,
      completedAt: experimentsLive.completedAt,
      scaleFactor: experimentsLive.scaleFactor,
      outcome: experimentsLive.outcome,
      costTotal: experimentsLive.costTotal,
      currency: experimentsLive.currency,
      // The second of the two deliberate exceptions — see `listExperiments`.
      revisionNumber: recipeRevisionsAll.revisionNumber,
      revisionWithdrawn: sql<boolean>`${recipeRevisionsAll.deletedAt} IS NOT NULL`,
      recipeSlug: recipesLive.slug,
      recipeTitle: recipesLive.title,
    })
    .from(experimentsLive)
    .leftJoin(recipesLive, eq(recipesLive.id, experimentsLive.recipeId))
    .leftJoin(
      recipeRevisionsAll,
      eq(recipeRevisionsAll.id, experimentsLive.revisionId),
    )
    .where(eq(experimentsLive.slug, slug))
    .limit(1);

  const row = found[0];
  if (!row) return null;

  const [itemRows, observationRows, noteRows] = await Promise.all([
    db
      .select({ label: experimentItems.label, note: experimentItems.note })
      .from(experimentItems)
      .where(eq(experimentItems.experimentId, row.id))
      .orderBy(asc(experimentItems.position)),
    db
      .select({
        item: experimentItems.label,
        metric: experimentObservations.metric,
        value: experimentObservations.value,
        unit: experimentObservations.unit,
        recordedAt: experimentObservations.recordedAt,
        note: experimentObservations.note,
      })
      .from(experimentObservations)
      .leftJoin(
        experimentItems,
        eq(experimentItems.id, experimentObservations.itemId),
      )
      .where(eq(experimentObservations.experimentId, row.id))
      .orderBy(
        asc(experimentItems.position),
        asc(experimentObservations.metric),
      ),
    db
      .select({
        id: notesLive.id,
        kind: notesLive.kind,
        title: notesLive.title,
        body: notesLive.body,
        conditions: notesLive.conditions,
        createdAt: notesLive.createdAt,
      })
      .from(notesLive)
      .where(eq(notesLive.experimentId, row.id))
      // The note order — see `getRecipeBySlug`. `logExperiment` writes every
      // note on a run in one transaction, so this list was the one most
      // exposed to the tie: batch 2 carries three.
      .orderBy(
        asc(notesLive.createdAt),
        asc(notesLive.position),
        asc(notesLive.id),
      ),
  ]);

  return {
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    scaleFactor: n(row.scaleFactor),
    outcome: row.outcome,
    costTotal: n(row.costTotal),
    currency: row.currency,
    revisionNumber: row.revisionNumber ?? null,
    revisionWithdrawn: row.revisionWithdrawn ?? false,
    recipe: row.recipeSlug
      ? { slug: row.recipeSlug, title: row.recipeTitle! }
      : null,
    items: itemRows,
    observations: observationRows.map((o) => ({ ...o, value: n(o.value) })),
    notes: noteRows.map((x) => ({
      id: x.id,
      kind: x.kind,
      title: x.title,
      body: x.body,
      conditions: x.conditions,
      createdAt: x.createdAt.toISOString(),
      sources: [],
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Science
// ─────────────────────────────────────────────────────────────────────────

/**
 * The recipe a note belongs to.
 *
 * A note hangs off exactly one subject — the `note_has_exactly_one_subject`
 * check in src/db/schema.ts enforces it — and four of the five subjects lead
 * back to a recipe:
 *
 * - `recipe_id`, written by `createRecipe` and by `addNote` with a recipe
 *   slug. This is where nearly every science note lives.
 * - `revision_id`, written by `reviseRecipe`, by `backfillRevision` and by
 *   `addNote` with a `revisionNumber`. A note pinned to one version of a
 *   method is still that recipe's science.
 * - `step_id`. Nothing sets it today — `writeNotes` takes the column but no
 *   caller passes it — so it is covered here rather than discovered later.
 * - `experiment_id`, written by `logExperiment` and by `addNote` with an
 *   experiment slug. A run names a recipe only optionally (K-01), so this
 *   path can end nowhere.
 *
 * The fifth, `ingredient_id`, never leads to a recipe. A note on veal
 * knuckle belongs to the ingredient, and `getIngredient` already shows it.
 * It cannot satisfy R-SCR-40 — a science note must link back to its recipe —
 * so /science does not carry it, and neither does a note on a run that names
 * no recipe. The inner join in `listScienceIndex` is what drops both.
 *
 * **Only the current revision counts.** `getRecipeBySlug` reads a recipe's
 * notes as `recipe_id` OR the *current* `revision_id`, so a note on a
 * superseded revision — everything `backfillRevision` writes, by design, as
 * it never moves `current_revision_id` — is not on the recipe page. Were
 * this expression to reach every revision, /science would show a mechanism
 * under "From <recipe>" and send the reader to a page that does not hold
 * it, which is R-SCR-40 answered with a broken promise. The two reads agree
 * instead.
 */
const noteRecipeId = sql<string | null>`COALESCE(
  ${notesLive.recipeId},
  (SELECT r.id FROM recipes_live r
     JOIN recipe_revisions_live rev ON rev.id = r.current_revision_id
    WHERE rev.id = ${notesLive.revisionId}),
  (SELECT r.id FROM recipes_live r
     JOIN recipe_steps st ON st.revision_id = r.current_revision_id
    WHERE st.id = ${notesLive.stepId}),
  (SELECT ex.recipe_id FROM experiments_live ex
    WHERE ex.id = ${notesLive.experimentId})
)`;

/**
 * The same rule as `noteRecipeId`, turned round so an index can be used.
 *
 * `noteRecipeId` maps a note to its recipe, which is what a join needs.
 * Asking the reverse question of it — `WHERE <that COALESCE> = $1` — makes
 * every disjunct a correlated subquery evaluated per row, so Postgres reads
 * all of `notes` and neither `idx_notes_recipe` nor `idx_notes_revision` can
 * help. This states the same four paths as comparisons on the indexed
 * columns themselves, which is what `getScienceStudy` wants: it runs on a
 * `force-dynamic` page, twice per render.
 *
 * Change one of these and change the other. They encode one rule.
 */
function noteBelongsToRecipe(recipeId: SQLWrapper | string) {
  return sql`(
    ${notesLive.recipeId} = ${recipeId}
    OR ${notesLive.revisionId} = (
      SELECT r.current_revision_id FROM recipes_live r WHERE r.id = ${recipeId})
    OR ${notesLive.stepId} IN (
      SELECT st.id FROM recipe_steps st
        JOIN recipes_live r ON r.current_revision_id = st.revision_id
       WHERE r.id = ${recipeId})
    OR ${notesLive.experimentId} IN (
      SELECT ex.id FROM experiments_live ex WHERE ex.recipe_id = ${recipeId})
  )`;
}

/**
 * A study: a recipe the science pages answer for. That is a recipe of the
 * `research` kind — which holds notes rather than steps — or any recipe that
 * carries at least one science note, because a mechanism has to be readable
 * somewhere and `/science/[slug]` is where it is read. The two halves are
 * the same rule `getScienceStudy` applies before it returns a study, so the
 * index lists exactly the addresses that answer.
 */
export interface ScienceStudyCard {
  slug: string;
  title: string;
  summary: string | null;
  kind: string;
  /** Its science notes. Drawn as "FOUR MECHANISMS" on the card. */
  mechanismCount: number;
}

/** One science note — what happens in the food, and why. */
export interface MechanismView {
  id: string;
  /** The label as drawn: `M1`, `M2`… See `listScienceIndex` on ordering. */
  code: string;
  title: string | null;
  body: string;
  /**
   * The conditions, as separate values: `232 °C`, `45 min`, `single layer
   * on a rack`. R-SCR-41 requires them separate rather than written into a
   * sentence, and the drawing puts them in capitals rather than the store.
   *
   * Read from `notes.conditions`, which D-02 added. Empty for a note that
   * has not been given any, and a caller draws no row for an empty list —
   * so a mechanism written before the column existed still renders.
   */
  conditions: string[];
  recipeSlug: string;
  recipeTitle: string;
}

/** One research note, in the index's "FROM THE RECIPES" list. */
export interface ResearchNoteCard {
  id: string;
  /** The label as drawn: `R1`, `R2`… */
  code: string;
  title: string | null;
  recipeSlug: string;
  recipeTitle: string;
}

/**
 * One citation, from `note_sources`. R-SCR-42 asks for the work, the part
 * of it, and the date a person read it.
 */
export interface CitationView {
  /** The label as drawn: `[1]`, `[2]`… Positional within the study. */
  code: string;
  /** The work — `note_sources.title`. */
  work: string | null;
  /** Which part of it — `note_sources.citation`. */
  part: string | null;
  url: string | null;
  /** The date a person read it, `YYYY-MM-DD`. */
  accessedAt: string | null;
  /** The note that cites it, so a page can tie `[1]` to a mechanism. */
  noteId: string;
}

export interface ScienceIndexView {
  studies: ScienceStudyCard[];
  mechanisms: MechanismView[];
  research: ResearchNoteCard[];
}

export interface ScienceStudyView {
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  kind: string;
  mechanisms: MechanismView[];
  citations: CitationView[];
  /**
   * The recipes that lean on this study — the design's "APPLIED IN". See
   * `getScienceStudy` on which direction of a `recipe_links` edge means
   * that, which is not the same for every kind.
   */
  appliedIn: RecipeSummaryView[];
}

/**
 * Everything on /science in one read: the studies, every mechanism across
 * every recipe, and every research note. This closes K-04.
 *
 * **The order, and why.** Notes are ordered by recipe title, then by when
 * the note was written, then by its id. Title first because the reader
 * meets one recipe's mechanisms together and a title never changes, so the
 * grouping is stable; `updated_at DESC`, which the other indexes use, would
 * renumber every code whenever any recipe was touched. The id breaks the
 * tie because `created_at` defaults to `now()`, which in Postgres is
 * transaction time — every note written by one `createRecipe` call shares a
 * timestamp to the microsecond, so creation time alone would leave the
 * order, and with it the codes, to the planner.
 *
 * **The codes.** `M1…` is a position **within its recipe**, so a mechanism
 * carries the same code here and on `/science/[slug]`, which numbers a
 * study's own mechanisms from M1 over the same rows in the same order. `R1…`
 * is a position in the flat research list, which no other screen draws. A
 * code that means one thing everywhere is a column on `notes` rather than a
 * position at all — the same conversation as D-02.
 */
export async function listScienceIndex(): Promise<ScienceIndexView> {
  const [noteRows, studyRows] = await Promise.all([
    db
      .select({
        id: notesLive.id,
        kind: notesLive.kind,
        title: notesLive.title,
        body: notesLive.body,
        conditions: notesLive.conditions,
        recipeSlug: recipesLive.slug,
        recipeTitle: recipesLive.title,
      })
      .from(notesLive)
      .innerJoin(recipesLive, eq(recipesLive.id, noteRecipeId))
      .where(
        and(
          inArray(notesLive.kind, ['science', 'research']),
          eq(recipesLive.status, 'active'),
        ),
      )
      // Recipe first, then the note order — see `getRecipeBySlug`. The
      // within-recipe half has to be the same three columns `getScienceStudy`
      // uses, because both screens number a study's mechanisms `M1…Mn` from
      // this order and a badge that reads M3 on one and M1 on the next names
      // two different things to a reader.
      .orderBy(
        asc(recipesLive.title),
        asc(notesLive.createdAt),
        asc(notesLive.position),
        asc(notesLive.id),
      ),
    db
      .select({
        slug: recipesLive.slug,
        title: recipesLive.title,
        summary: recipesLive.summary,
        kind: recipesLive.kind,
      })
      .from(recipesLive)
      .where(
        and(
          eq(recipesLive.status, 'active'),
          or(
            eq(recipesLive.kind, 'research'),
            // A preparation with a mechanism on it is a study too — the
            // demi-glace case the design draws. Listing only the research
            // recipes left `/science/demi-glace` answering with no card
            // anywhere that reaches it.
            sql`EXISTS (SELECT 1 FROM ${notesLive}
                  WHERE ${notesLive.kind} = 'science'
                    AND ${noteBelongsToRecipe(recipesLive.id)})`,
          ),
        ),
      )
      .orderBy(asc(recipesLive.title)),
  ]);

  const mechanisms: MechanismView[] = [];
  const research: ResearchNoteCard[] = [];
  // Counted from the same rows the page renders, so a study card can never
  // promise a mechanism that the list below it does not show.
  const mechanismCounts = new Map<string, number>();

  for (const row of noteRows) {
    if (row.kind === 'science') {
      // Numbered within the recipe, not across the list. `getScienceStudy`
      // numbers a study's mechanisms from M1 over the same rows in the same
      // order, so the code a reader sees here is the code they see when
      // they follow the link — a badge that reads M5 on one screen and M1
      // on the next names two different things to them.
      const position = (mechanismCounts.get(row.recipeSlug) ?? 0) + 1;
      mechanismCounts.set(row.recipeSlug, position);
      mechanisms.push({
        id: row.id,
        code: `M${position}`,
        title: row.title,
        body: row.body,
        conditions: row.conditions,
        recipeSlug: row.recipeSlug,
        recipeTitle: row.recipeTitle,
      });
    } else {
      research.push({
        id: row.id,
        code: `R${research.length + 1}`,
        title: row.title,
        recipeSlug: row.recipeSlug,
        recipeTitle: row.recipeTitle,
      });
    }
  }

  return {
    studies: studyRows.map((row) => ({
      ...row,
      mechanismCount: mechanismCounts.get(row.slug) ?? 0,
    })),
    mechanisms,
    research,
  };
}

/**
 * One study — `/science/[slug]`.
 *
 * Null when nothing answers to that slug, and null for a recipe that is
 * neither a study nor carries a mechanism, so `/science/tomato-soup` is a
 * 404 rather than an empty page at a second address for the same dish.
 *
 * Notes are ordered as they are on the index (creation, then id) and the
 * mechanisms are numbered from M1 within this study. Citations follow the
 * order of the notes that carry them and are deduplicated: one work cited
 * by two mechanisms is one entry in the reference list, not two.
 *
 * There is deliberately no status filter, matching `getRecipeBySlug`: a
 * study that has been archived still answers at its own address.
 */
export async function getScienceStudy(
  recipeSlug: string,
): Promise<ScienceStudyView | null> {
  const found = await db
    .select({
      id: recipesLive.id,
      slug: recipesLive.slug,
      title: recipesLive.title,
      subtitle: recipesLive.subtitle,
      summary: recipesLive.summary,
      kind: recipesLive.kind,
    })
    .from(recipesLive)
    .where(eq(recipesLive.slug, recipeSlug))
    .limit(1);

  const recipe = found[0];
  if (!recipe) return null;

  // Every note of the recipe, not only its science: the reference list at
  // the foot of a study is the study's citations, and a research note is
  // required to carry sources where a science note is not.
  const noteRows = await db
    .select({
      id: notesLive.id,
      kind: notesLive.kind,
      title: notesLive.title,
      body: notesLive.body,
      conditions: notesLive.conditions,
      experimentId: notesLive.experimentId,
    })
    .from(notesLive)
    .where(noteBelongsToRecipe(recipe.id))
    // The note order — see `getRecipeBySlug`. This read spans four subjects
    // (the recipe, its current revision, its steps and its runs), which is
    // why `created_at` leads: it is what puts the groups in the order they
    // were written, and `position` orders inside each one.
    .orderBy(
      asc(notesLive.createdAt),
      asc(notesLive.position),
      asc(notesLive.id),
    );

  const mechanisms: MechanismView[] = noteRows
    .filter((row) => row.kind === 'science')
    .map((row, index) => ({
      id: row.id,
      code: `M${index + 1}`,
      title: row.title,
      body: row.body,
      conditions: row.conditions,
      recipeSlug: recipe.slug,
      recipeTitle: recipe.title,
    }));

  if (recipe.kind !== 'research' && mechanisms.length === 0) return null;

  // The notes the study itself is made of: the ones on the recipe, its
  // current revision or a step of it. A note on a *run* reaches this recipe
  // too — `logExperiment` writes notes against an experiment and a
  // `NoteInput` carries sources — but a source cited while weighing a batch
  // is a record of that batch, and printing it under "References"
  // attributes it to the study. Filtered by subject rather than by kind,
  // because a citation is not the preserve of a science note: the
  // Wellington's one source hangs off a `warning`.
  const citedNotes = noteRows.filter((row) => row.experimentId === null);

  const [sourceRows, appliedInRows] = await Promise.all([
    citedNotes.length
      ? db
          .select({
            noteId: noteSources.noteId,
            url: noteSources.url,
            title: noteSources.title,
            citation: noteSources.citation,
            accessedAt: noteSources.accessedAt,
          })
          .from(noteSources)
          .where(
            inArray(
              noteSources.noteId,
              citedNotes.map((row) => row.id),
            ),
          )
          // Same three columns as the note order, one level down. Every
          // source of a note is written in the note's own transaction, so
          // `created_at` ties across all of them and `position` is what
          // decides; `[1]…[4]` under a study renumbered between loads
          // without it.
          .orderBy(
            asc(noteSources.createdAt),
            asc(noteSources.position),
            asc(noteSources.id),
          )
      : [],
    // "Applied in" is the recipes that lean on this study, and which edge
    // says so depends on the kind. An *incoming* `references`,
    // `derived_from` or `variant_of` means the other recipe was built on
    // this one. An *outgoing* `component_of` means the same thing the other
    // way round — "demi-glace is a component of the Wellington" is written
    // from demi-glace, and it is the Wellington that applies demi-glace.
    // Reading every incoming edge, as the first draft did, printed that one
    // backwards. `pairs_with` is an association in neither direction and is
    // not an application, so it is left out.
    db
      .select(recipeSummaryColumns)
      .from(recipeLinks)
      .innerJoin(
        recipesLive,
        or(
          and(
            eq(recipesLive.id, recipeLinks.fromRecipeId),
            eq(recipeLinks.toRecipeId, recipe.id),
            inArray(recipeLinks.kind, [
              'references',
              'derived_from',
              'variant_of',
            ]),
          ),
          and(
            eq(recipesLive.id, recipeLinks.toRecipeId),
            eq(recipeLinks.fromRecipeId, recipe.id),
            eq(recipeLinks.kind, 'component_of'),
          ),
        ),
      )
      .leftJoin(
        recipeRevisionsLive,
        eq(recipeRevisionsLive.id, recipesLive.currentRevisionId),
      )
      .where(
        or(
          eq(recipeLinks.toRecipeId, recipe.id),
          eq(recipeLinks.fromRecipeId, recipe.id),
        ),
      )
      .orderBy(asc(recipesLive.title)),
  ]);

  // Note order first, then the order the sources were written in. Sort is
  // stable, so the second survives inside the first.
  const noteOrder = new Map(citedNotes.map((row, index) => [row.id, index]));
  const ordered = [...sourceRows].sort(
    (a, b) => (noteOrder.get(a.noteId) ?? 0) - (noteOrder.get(b.noteId) ?? 0),
  );

  const citations: CitationView[] = [];
  const seen = new Set<string>();
  for (const source of ordered) {
    const key = [source.url, source.title, source.citation, source.accessedAt]
      .map((value) => value ?? '')
      .join(' | ');
    if (seen.has(key)) continue;
    seen.add(key);
    citations.push({
      code: `[${citations.length + 1}]`,
      work: source.title,
      part: source.citation,
      url: source.url,
      accessedAt: source.accessedAt,
      noteId: source.noteId,
    });
  }

  // `uq_recipe_link` is unique on (from, to, kind), so two recipes can be
  // joined by more than one edge and the same recipe arrive twice. It would
  // read as a duplicate card, a duplicate React key and an inflated count.
  const appliedIn = [
    ...new Map(appliedInRows.map((row) => [row.id, row])).values(),
  ];

  const appliedTerms = await attachTerms(appliedIn);

  return {
    slug: recipe.slug,
    title: recipe.title,
    subtitle: recipe.subtitle,
    summary: recipe.summary,
    kind: recipe.kind,
    mechanisms,
    citations,
    appliedIn: appliedIn.map((row) =>
      toSummary(row, appliedTerms.get(row.id) ?? []),
    ),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Index page
// ─────────────────────────────────────────────────────────────────────────

export async function getStats(): Promise<{
  recipes: number;
  revisions: number;
  ingredients: number;
  terms: number;
  notes: number;
  experiments: number;
}> {
  const statsResult = await db.execute<{
    recipes: string;
    revisions: string;
    ingredients: string;
    terms: string;
    notes: string;
    experiments: string;
  }>(sql`
    SELECT
      (SELECT COUNT(*) FROM recipes_live WHERE status = 'active') AS recipes,
      (SELECT COUNT(*) FROM recipe_revisions_live)                AS revisions,
      (SELECT COUNT(*) FROM ingredients_live)                     AS ingredients,
      (SELECT COUNT(*) FROM taxonomy_terms_live)                  AS terms,
      (SELECT COUNT(*) FROM notes_live)                           AS notes,
      (SELECT COUNT(*) FROM experiments_live)                     AS experiments
  `);

  const row = statsResult.rows[0];
  return {
    recipes: Number(row?.recipes ?? 0),
    revisions: Number(row?.revisions ?? 0),
    ingredients: Number(row?.ingredients ?? 0),
    terms: Number(row?.terms ?? 0),
    notes: Number(row?.notes ?? 0),
    experiments: Number(row?.experiments ?? 0),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Shopping list
// ─────────────────────────────────────────────────────────────────────────

export interface ShoppingListEntry {
  /** Canonical ingredient slug, or null for an unresolved written line. */
  slug: string | null;
  name: string;
  category: string;
  /** Summed amounts, one per unit bucket that could not be merged. */
  amounts: string[];
  /** True when at least one contributing line had no quantity at all. */
  unquantified: boolean;
  /** True when every contributing line was marked optional. */
  optional: boolean;
  /** Recipes that put this on the list, and what each of them asked for. */
  from: { slug: string; title: string; text: string }[];
}

export interface ShoppingListGroup {
  category: string;
  entries: ShoppingListEntry[];
}

export interface ShoppingList {
  recipes: { slug: string; title: string }[];
  /** Slugs that were asked for but do not exist. */
  missing: string[];
  groups: ShoppingListGroup[];
  totalEntries: number;
}

/**
 * Aggregate the ingredients of several recipes into one shopping list.
 *
 * Reads each recipe's *current* revision — a shopping list for a superseded
 * version is a way to cook last month's mistake.
 *
 * Amounts are summed only within a compatible unit bucket (see
 * `quantityBucket`), so 800 g and 1 kg become 1.8 kg while three cloves and
 * two heads stay two separate lines. Anything unquantified is carried as a
 * flag rather than guessed at.
 */
export async function buildShoppingList(
  slugs: string[],
): Promise<ShoppingList> {
  const wanted = [...new Set(slugs.map((s) => s.trim()).filter(Boolean))];
  if (wanted.length === 0) {
    return { recipes: [], missing: [], groups: [], totalEntries: 0 };
  }

  const recipeRows = await db
    .select({
      slug: recipesLive.slug,
      title: recipesLive.title,
      revisionId: recipesLive.currentRevisionId,
    })
    .from(recipesLive)
    .where(inArray(recipesLive.slug, wanted));

  const found = recipeRows.filter((r) => r.revisionId !== null);
  const missing = wanted.filter(
    (slug) => !recipeRows.some((r) => r.slug === slug),
  );

  if (found.length === 0) {
    return {
      recipes: [],
      missing,
      groups: [],
      totalEntries: 0,
    };
  }

  const titleByRevision = new Map(
    found.map((r) => [r.revisionId!, { slug: r.slug, title: r.title }]),
  );

  const lines = await db
    .select({
      revisionId: recipeIngredients.revisionId,
      quantity: recipeIngredients.quantity,
      // Read only so `unresolvedLineNeeds` can ask whether the stored
      // `raw_text` already states a RANGE. The totals below sum `quantity`
      // alone, as they always have.
      quantityMax: recipeIngredients.quantityMax,
      unit: recipeIngredients.unit,
      optional: recipeIngredients.optional,
      rawText: recipeIngredients.rawText,
      preparation: recipeIngredients.preparation,
      ingredientSlug: ingredientsLive.slug,
      ingredientName: ingredientsLive.name,
      ingredientCategory: ingredientsLive.category,
    })
    .from(recipeIngredients)
    .leftJoin(
      ingredientsLive,
      eq(ingredientsLive.id, recipeIngredients.ingredientId),
    )
    .where(
      inArray(
        recipeIngredients.revisionId,
        found.map((r) => r.revisionId!),
      ),
    )
    .orderBy(recipeIngredients.position);

  interface Accumulator {
    slug: string | null;
    name: string;
    category: string;
    buckets: Map<
      string,
      {
        bucket: QuantityBucket;
        /** Total in the bucket's base unit, for cross-unit conversion. */
        amount: number;
        /** Total per unit as written, so a unit nobody used is never shown. */
        byUnit: Map<string, number>;
      }
    >;
    unquantified: boolean;
    optionalCount: number;
    lineCount: number;
    from: { slug: string; title: string; text: string }[];
  }

  const byIngredient = new Map<string, Accumulator>();

  for (const line of lines) {
    const source = titleByRevision.get(line.revisionId);
    if (!source) continue;

    // Unresolved lines still belong on the list — they are things to buy —
    // so they key on their own text rather than being dropped. On the NAME
    // the text has first had the measure it states taken off it: this list
    // prints the amount in a column of its own, and a row reading `50 kg`
    // beside `50–60 kg Crayfish, live` states the measure twice and gets it
    // wrong the second time, because the amount is a sum across every recipe
    // asked for and the raw text is one recipe's line. `unresolvedLineName`
    // carries the reasoning; the line as each recipe wrote it survives
    // verbatim in `from` below.
    //
    // `wording` is the other half and they are not the same string: the NAME
    // is what to buy, the WORDING is what one recipe asked for, and `from`
    // below prints the second verbatim. Taking the measure off that one too
    // would lose the only place this row still says how much THIS recipe
    // wanted.
    const wording = line.ingredientName ?? line.rawText;
    const name =
      line.ingredientName ??
      unresolvedLineName({
        rawText: line.rawText,
        quantity: line.quantity == null ? null : Number(line.quantity),
        quantityMax: line.quantityMax == null ? null : Number(line.quantityMax),
        unit: line.unit,
      });
    const key = line.ingredientSlug ?? `raw:${name.trim().toLowerCase()}`;

    let entry = byIngredient.get(key);
    if (!entry) {
      entry = {
        slug: line.ingredientSlug,
        name,
        category: line.ingredientCategory ?? 'other',
        buckets: new Map(),
        unquantified: false,
        optionalCount: 0,
        lineCount: 0,
        from: [],
      };
      byIngredient.set(key, entry);
    }

    entry.lineCount += 1;
    if (line.optional) entry.optionalCount += 1;

    const quantity = line.quantity == null ? null : Number(line.quantity);
    if (quantity == null || !Number.isFinite(quantity)) {
      entry.unquantified = true;
    } else {
      const bucket = quantityBucket(line.unit);
      const existing = entry.buckets.get(bucket.key);
      const added = quantity * bucket.toBase;
      // Keep a total per written unit alongside the base-unit total. The
      // base is what lets 800 g and 1 kg become 1.8 kg; the per-unit totals
      // are what stop three tablespoons becoming "44.4 ml".
      const writtenUnit = bucket.canonical ?? '';
      if (existing) {
        existing.amount += added;
        existing.byUnit.set(
          writtenUnit,
          (existing.byUnit.get(writtenUnit) ?? 0) + quantity,
        );
      } else {
        entry.buckets.set(bucket.key, {
          bucket,
          amount: added,
          byUnit: new Map([[writtenUnit, quantity]]),
        });
      }
    }

    // WHAT THIS RECIPE ASKED FOR, in its own words.
    //
    // The amount is restated only when the name came from the canonical
    // ingredient. `raw_text` IS the line as it was written, amount and all,
    // so prepending the measure to it reads `10 pod 10 pod Star anise`. The
    // archive has no unresolved line, which is why that was never seen; soft
    // delete makes the state reachable, because deleting an ingredient
    // leaves every line that named it on its revision and the line degrades
    // to its own text. `recipeToMarkdown` carries the same note.
    //
    // WHICH of the three the text already carries is asked of the text, not
    // inferred from whether the ingredient resolved. A caller-supplied
    // `rawText` is routinely the name alone, and dropping the measure there
    // made this line disagree with the total above it, which still counts
    // the amount. `unresolvedLineNeeds` carries the reasoning.
    const needs = line.ingredientName
      ? { measure: true, preparation: true, optional: true }
      : unresolvedLineNeeds({
          rawText: line.rawText,
          quantity,
          quantityMax:
            line.quantityMax == null ? null : Number(line.quantityMax),
          unit: line.unit,
          preparation: line.preparation,
          optional: line.optional,
        });
    entry.from.push({
      slug: source.slug,
      title: source.title,
      text: formatIngredientLine({
        quantity: needs.measure ? quantity : null,
        unit: needs.measure ? line.unit : null,
        name: wording,
        preparation: needs.preparation ? line.preparation : null,
        optional: needs.optional && line.optional,
      }),
    });
  }

  const byCategory = new Map<string, ShoppingListEntry[]>();
  for (const entry of byIngredient.values()) {
    const view: ShoppingListEntry = {
      slug: entry.slug,
      name: entry.name,
      category: entry.category,
      amounts: [...entry.buckets.values()].map(({ bucket, amount, byUnit }) =>
        formatAggregate(bucket, amount, byUnit),
      ),
      unquantified: entry.unquantified,
      optional: entry.optionalCount === entry.lineCount,
      from: entry.from,
    };
    const list = byCategory.get(view.category) ?? [];
    list.push(view);
    byCategory.set(view.category, list);
  }

  const groups = [...byCategory.entries()]
    .map(([category, entries]) => ({
      category,
      entries: entries.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort(
      (a, b) =>
        categoryRank(a.category) - categoryRank(b.category) ||
        a.category.localeCompare(b.category),
    );

  return {
    recipes: found.map((r) => ({ slug: r.slug, title: r.title })),
    missing,
    groups,
    totalEntries: byIngredient.size,
  };
}
