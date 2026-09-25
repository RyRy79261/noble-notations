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
 * Seven tables carry a soft delete, and each has a `*_live` view over it in
 * `src/db/schema.ts` that is `WHERE deleted_at IS NULL` and nothing else.
 * This file selects from those views. A read that names the base table by
 * mistake publishes a record somebody deleted, and it fails silently:
 * nothing throws, the page renders, and the row is back.
 *
 * Three things hold that, in decreasing order of strength:
 *
 * 1. **`eslint.config.mjs` bans the seven base tables from this file.** A new
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
  experimentImages,
  experimentItems,
  experimentObservations,
  experimentsLive,
  imagesLive,
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
import type { ImageRendition } from '@/db/schema';
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
import type {
  CategoryType,
  SearchNotesInput,
  SearchRecipesInput,
} from '@/lib/domain/schemas';

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
  /**
   * Optional, unlike the two on a recipe, and the shape says why: a tag is
   * read in two places. `getTerm` draws the tag's own PAGE and fills these;
   * `attachTerms` draws the chips on a recipe card, where a picture has
   * nowhere to go and reading two more columns per tag per card would be
   * paid for on every index. Absent means "this read did not ask", which is
   * a different fact from `null` — "there is no picture".
   */
  heroImageUrl?: string | null;
  heroImageAlt?: string | null;
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
  /**
   * Every record this note hung off before this one, oldest first, as
   * `recipe:<slug>`, `ingredient:<slug>` or `experiment:<slug>`. Empty on a
   * note that has never moved, which is nearly all of them. D-13.
   *
   * A note written before its natural parent existed can be re-homed with
   * `reattachNote`, and this is what stops that being a silent rewrite of
   * where a claim came from.
   */
  movedFrom: string[];
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

/**
 * The dish a recipe is a variation OF, as a card needs it: enough to say so
 * and to link there, and nothing more.
 *
 * Null on a base dish, which is nearly every recipe — and null too when the
 * parent has been deleted, because `attachVariantOf` reads the live view. A
 * card that said "a variation of" and linked at a 404 would be worse than a
 * card that said nothing.
 */
export interface VariantOfView {
  slug: string;
  title: string;
  /** What makes this one different: "With shiitake instead of pork". */
  note: string | null;
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
  /**
   * Set on a variation, so a card can say which dish it varies. The owner
   * asked for this in the same breath as the panel: a base and its three
   * variations otherwise read as four unrelated near-identical dishes on the
   * index, and the reader has no way to tell which one is the original.
   */
  variantOf: VariantOfView | null;
}

/**
 * One recipe in a variation family, flattened into the order it is drawn:
 * the base dish first, then each branch under the recipe it varies.
 *
 * A LIST and not a nested tree, because the panel draws an indent rather
 * than a nesting, and because `depth` is the only thing the markup needs
 * from the shape — a `children` array would make every consumer walk it
 * again to get back to the order it is already in.
 */
export interface VariantNodeView {
  slug: string;
  title: string;
  /** What makes it different. Null on the base dish, and where nothing was said. */
  variantNote: string | null;
  /** 0 for the base dish, 1 for a variation of it, and so on. */
  depth: number;
  /** How many versions this member has of its own. */
  revisionCount: number;
  /** True for the one recipe the page is about. */
  self: boolean;
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
  /**
   * Every member of this recipe's variation family, base dish first, or an
   * empty list when this recipe varies nothing and nothing varies it.
   *
   * The WHOLE family and not just a parent and its children: the owner's
   * word for these was siblings, and a panel that showed only one step in
   * each direction would put a sibling two clicks away and would look
   * different from every member of the same family. `variantFamily` climbs
   * to the base dish and comes back down, so any member draws the same tree.
   *
   * A family of one is an empty list rather than a list holding this recipe.
   * A tab with nothing behind it is a dead control (R-SCR-27), and "one
   * variation: this one" is nothing.
   */
  variantFamily: VariantNodeView[];
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
  variantOfId: recipesLive.variantOfId,
  variantNote: recipesLive.variantNote,
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

/**
 * Resolve the parent of every variation in a batch, in one extra query.
 *
 * The same shape as `attachTerms` and for the same reason: a card needs the
 * parent's title and slug, those live on another row, and a join inside
 * `recipeSummaryColumns` would mean adding one to all seven queries that
 * spread it. One keyed lookup afterwards is the pattern this file already
 * uses.
 *
 * `recipesLive`, so a deleted parent resolves to nothing and the card falls
 * back to saying nothing at all.
 */
async function attachVariantOf<T extends { variantOfId: string | null }>(
  rows: T[],
): Promise<Map<string, { slug: string; title: string }>> {
  const byId = new Map<string, { slug: string; title: string }>();
  const wanted = [
    ...new Set(
      rows.map((r) => r.variantOfId).filter((id): id is string => id !== null),
    ),
  ];
  if (wanted.length === 0) return byId;

  const parents = await db
    .select({
      id: recipesLive.id,
      slug: recipesLive.slug,
      title: recipesLive.title,
    })
    .from(recipesLive)
    .where(inArray(recipesLive.id, wanted));
  for (const parent of parents) {
    byId.set(parent.id, { slug: parent.slug, title: parent.title });
  }
  return byId;
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
    variantOfId: string | null;
    variantNote: string | null;
  },
  terms: TermView[],
  parents: Map<string, { slug: string; title: string }>,
): RecipeSummaryView {
  const parent = row.variantOfId ? parents.get(row.variantOfId) : undefined;
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
    variantOf: parent
      ? { slug: parent.slug, title: parent.title, note: row.variantNote }
      : null,
  };
}

/**
 * How deep a family is walked before the query gives up.
 *
 * `assertNoVariantCycle` makes a loop unreachable through the write layer,
 * so this bound is never met by anything the connector wrote. It is here for
 * what the write layer does not own: a hand-written `UPDATE` against the
 * database, or a restore of something strange. Without it a loop is not a
 * wrong panel, it is a recursive CTE that never returns — a page that hangs
 * rather than a page that is wrong, and on the public site.
 *
 * Twenty is far past anything real. A variation of a variation of a
 * variation is already unusual.
 */
const VARIANT_DEPTH_LIMIT = 20;

/**
 * Every member of one recipe's variation family, base dish first, each
 * branch under the recipe it varies.
 *
 * ── THE TWO WALKS ─────────────────────────────────────────────────────
 *
 * `up` climbs from this recipe to the base dish; `down` descends from the
 * base dish through every branch. Two walks and not one, because the panel
 * has to look the same from every member — standing on "with shiitake" you
 * see the base, your sibling "with lamb" and your own branch below, which is
 * exactly what the owner meant by siblings. One walk downwards from the
 * addressed recipe would show a different family to each member, and no
 * member would ever see the dish it came from.
 *
 * ── WHAT COUNTS AS A MEMBER ───────────────────────────────────────────
 *
 * `visible` is the definition, and it is one rule covering two cases:
 *
 *   live, and not a draft — **or** this recipe itself.
 *
 * A DELETED recipe is not a member. Its `variant_of_id` is untouched by the
 * delete and its children keep theirs, so nothing is lost: the family simply
 * breaks at the gap, the branch below becomes a family of its own, and
 * `restore_record` joins them back exactly. That is the same answer
 * `recipe_terms` gives for an edge to a deleted tag.
 *
 * A DRAFT is not a member either, and breaks the chain the same way. `draft`
 * means "hidden from listings", and a panel on a public page is a listing.
 * The exception for the addressed recipe is what lets a draft variation show
 * its own family on its own page while it is being written — otherwise the
 * one screen that needs the family most would be the one screen without it.
 *
 * ── THE ORDER ─────────────────────────────────────────────────────────
 *
 * `path` accumulates the titles down each branch, so ordering by it is a
 * pre-order walk with siblings alphabetical — stable across page loads, and
 * stable when a sibling is added, which an ordering by `created_at` is not.
 *
 * NOT EXPORTED, and that is a decision rather than an oversight. It takes a
 * recipe id where every exported read takes a slug, and `getRecipeBySlug` is
 * the only caller — so exporting it would add an entry to
 * `e2e/deleted-census.ts`'s table that could only be reached by looking an
 * id up first. The census still covers it: the family rides on the kept
 * recipe's result, and the fixture puts a DELETED member in the family so
 * the scan has something to find.
 */
async function variantFamily(recipeId: string): Promise<VariantNodeView[]> {
  const rows = await db.execute<{
    slug: string;
    title: string;
    variant_note: string | null;
    depth: number;
    revision_count: number;
    is_self: boolean;
  }>(sql`
    WITH RECURSIVE visible AS (
      SELECT id, variant_of_id, slug, title, variant_note
        FROM recipes_live
        WHERE status <> 'draft' OR id = ${recipeId}
    ),
    up AS (
      SELECT id, variant_of_id FROM visible WHERE id = ${recipeId}
      UNION
      SELECT v.id, v.variant_of_id
        FROM visible v
        JOIN up ON v.id = up.variant_of_id
    ),
    root AS (
      SELECT up.id
        FROM up
        WHERE NOT EXISTS (
          SELECT 1 FROM visible p WHERE p.id = up.variant_of_id
        )
        LIMIT 1
    ),
    down AS (
      SELECT v.id, 0 AS depth, ARRAY[v.title] AS path
        FROM visible v
        JOIN root ON root.id = v.id
      UNION ALL
      SELECT c.id, d.depth + 1, d.path || c.title
        FROM visible c
        JOIN down d ON c.variant_of_id = d.id
        WHERE d.depth < ${VARIANT_DEPTH_LIMIT}
    )
    SELECT v.slug,
           v.title,
           v.variant_note,
           d.depth,
           (SELECT count(*)::int
              FROM recipe_revisions_live rr
              WHERE rr.recipe_id = v.id) AS revision_count,
           (v.id = ${recipeId}) AS is_self
      FROM down d
      JOIN visible v ON v.id = d.id
      ORDER BY d.path
  `);

  // A family of one is this recipe alone, and that is not a family. The
  // panel is not drawn and the tab is not offered (R-SCR-27).
  if (rows.rows.length < 2) return [];

  return rows.rows.map((row) => ({
    slug: row.slug,
    title: row.title,
    variantNote: row.variant_note,
    depth: Number(row.depth),
    revisionCount: Number(row.revision_count),
    self: Boolean(row.is_self),
  }));
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

  const [terms, parents] = await Promise.all([
    attachTerms(rows),
    attachVariantOf(rows),
  ]);
  return rows.map((r) => toSummary(r, terms.get(r.id) ?? [], parents));
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
    variant_of_id: string | null;
    variant_note: string | null;
    rank: number;
    total: number;
  }>(sql`
    SELECT r.id, r.slug, r.title, r.subtitle, r.summary, r.kind,
           r.hero_image_url, r.hero_image_alt, r.updated_at,
           r.variant_of_id, r.variant_note,
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
    variant_of_id: string | null;
    variant_note: string | null;
    rank: number | string;
    total: number | string;
  }[];

  const withParent = list.map((r) => ({ ...r, variantOfId: r.variant_of_id }));
  const [terms, parents] = await Promise.all([
    attachTerms(list),
    attachVariantOf(withParent),
  ]);
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
          variantOfId: r.variant_of_id,
          variantNote: r.variant_note,
        },
        terms.get(r.id) ?? [],
        parents,
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

/**
 * The citations under a set of notes, grouped by note.
 *
 * WHY THIS IS A FUNCTION AND NOT THREE COPIES. It was one copy and two
 * hardcoded `sources: []` — `getIngredient` and `getExperiment` each
 * declared that notes on an ingredient and notes on a run carry no
 * citations. They do: `writeNotes` stores `sources` for any kind, the
 * schema *requires* one on a `research` note, and `NoteBlock` renders them
 * on every screen that draws a note. So a sourced research note written
 * through `log_experiment` — which is the documented way to record one —
 * came back from `get_experiment` with its provenance silently dropped,
 * and the run page drew the claim with nothing under it.
 *
 * The ORDER BY is the reason this must not be re-inlined a fourth time.
 * This read had none at all once, so citations reshuffled between two
 * loads of one seed and `pnpm export` produced a different `- Source:`
 * block each time. Same three columns as every other ordered read here.
 */
async function noteSourcesByNote(
  noteIds: string[],
): Promise<Map<string, NoteView['sources']>> {
  const byNote = new Map<string, NoteView['sources']>();
  if (noteIds.length === 0) return byNote;

  const rows = await db
    .select()
    .from(noteSources)
    .where(inArray(noteSources.noteId, noteIds))
    .orderBy(
      asc(noteSources.createdAt),
      asc(noteSources.position),
      asc(noteSources.id),
    );

  for (const row of rows) {
    const list = byNote.get(row.noteId) ?? [];
    list.push({
      url: row.url,
      title: row.title,
      citation: row.citation,
      accessedAt: row.accessedAt,
    });
    byNote.set(row.noteId, list);
  }
  return byNote;
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
      variantOfId: recipesLive.variantOfId,
      variantNote: recipesLive.variantNote,
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
          previousSubjects: notesLive.previousSubjects,
          createdAt: notesLive.createdAt,
        })
        .from(notesLive)
        .where(
          sql`${notesLive.recipeId} = ${recipe.id} OR ${notesLive.revisionId} = ${revision.id}`,
        )
        // THE NOTE ORDER. `sort_at` first, `position` second, `id` last —
        // the same three columns in the same order in all five reads that
        // return the notes of ONE SUBJECT, so a note holds one place in one
        // list wherever it is drawn.
        //
        // `searchNotes` is the deliberate exception, and the only one. It
        // crosses subjects to answer "what is here", which is the question
        // `listRecipes` and `listExperiments` answer newest first. It keeps
        // these same two columns as its tiebreaks, for the reason below.
        //
        // `sort_at` was `created_at` until a note could move between
        // subjects (D-13). A moved note keeps the date it was written and
        // arrives at its new subject today, and those are two different
        // facts; `created_at` holds the first and this holds the second.
        // Backfilled equal, so nothing stored reordered.
        //
        // `sort_at` defaults to `now()`, which Postgres holds fixed for a
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
          asc(notesLive.sortAt),
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

  const sourcesByNote = await noteSourcesByNote(noteRows.map((x) => x.id));

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

  const [linkedTerms, linkedParents, family] = await Promise.all([
    attachTerms([...linkRows, ...backlinkRows]),
    // The recipe itself rides along, so its own parent is resolved in the
    // same query as its links' parents rather than in one more of its own.
    attachVariantOf([recipe, ...linkRows, ...backlinkRows]),
    variantFamily(recipe.id),
  ]);

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
      movedFrom: row.previousSubjects,
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
    variantOf:
      recipe.variantOfId && linkedParents.has(recipe.variantOfId)
        ? {
            slug: linkedParents.get(recipe.variantOfId)!.slug,
            title: linkedParents.get(recipe.variantOfId)!.title,
            note: recipe.variantNote,
          }
        : null,
    variantFamily: family,
    links: linkRows.map((row) => ({
      kind: row.linkKind,
      note: row.linkNote,
      recipe: toSummary(row, linkedTerms.get(row.id) ?? [], linkedParents),
    })),
    backlinks: backlinkRows.map((row) => ({
      kind: row.linkKind,
      recipe: toSummary(row, linkedTerms.get(row.id) ?? [], linkedParents),
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

  const [terms, parents] = await Promise.all([
    attachTerms(rows),
    attachVariantOf(rows),
  ]);

  const toTermView = (row: {
    id: string;
    facet: string;
    slug: string;
    label: string;
    description: string | null;
    heroImageUrl: string | null;
    heroImageAlt: string | null;
  }): TermView => ({
    id: row.id,
    categoryType: row.facet as CategoryType,
    slug: row.slug,
    label: row.label,
    description: row.description,
    heroImageUrl: row.heroImageUrl,
    heroImageAlt: row.heroImageAlt,
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
    recipes: rows.map((r) => toSummary(r, terms.get(r.id) ?? [], parents)),
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
  /**
   * A picture of the raw ingredient. Required on this view rather than
   * optional, unlike `TermView`: both readers of it — the index and the
   * detail page — can use one, and the index is where telling two chillies
   * apart actually matters.
   */
  heroImageUrl: string | null;
  heroImageAlt: string | null;
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
      heroImageUrl: ingredientsLive.heroImageUrl,
      heroImageAlt: ingredientsLive.heroImageAlt,
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
      ingredientsLive.heroImageUrl,
      ingredientsLive.heroImageAlt,
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
      /*
       * Every selected column, derived rather than listed. `recipes_live` is
       * a VIEW, so Postgres cannot apply its functional-dependency shortcut
       * and `GROUP BY r.id` is not enough — every column of the select list
       * has to be named. Listed by hand this broke the moment
       * `recipeSummaryColumns` grew `variant_of_id`: the page threw, and it
       * threw in a query no type checker reads. Spreading the same object
       * the select takes makes the two impossible to disagree.
       */
      .groupBy(...Object.values(recipeSummaryColumns))
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
        previousSubjects: notesLive.previousSubjects,
        createdAt: notesLive.createdAt,
      })
      .from(notesLive)
      .where(eq(notesLive.ingredientId, row.id))
      // The note order — see `getRecipeBySlug`. `created_at` alone left
      // several notes written against one ingredient in planner order.
      .orderBy(
        asc(notesLive.sortAt),
        asc(notesLive.position),
        asc(notesLive.id),
      ),
  ]);

  const [terms, parents, sourcesByNote] = await Promise.all([
    attachTerms(usedIn),
    attachVariantOf(usedIn),
    noteSourcesByNote(noteRows.map((x) => x.id)),
  ]);

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
      heroImageUrl: row.heroImageUrl,
      heroImageAlt: row.heroImageAlt,
      recipeCount: usedIn.length,
    },
    recipes: usedIn.map((r) => toSummary(r, terms.get(r.id) ?? [], parents)),
    substitutes: subs,
    notes: noteRows.map((x) => ({
      id: x.id,
      kind: x.kind,
      title: x.title,
      body: x.body,
      conditions: x.conditions,
      movedFrom: x.previousSubjects,
      createdAt: x.createdAt.toISOString(),
      sources: sourcesByNote.get(x.id) ?? [],
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
  /** The one picture that stands for the run. */
  heroImageUrl: string | null;
  heroImageAlt: string | null;
  /**
   * The rest of the run's pictures, in reading order.
   *
   * A run is the only record here that takes a LIST, and the reason is what
   * a run is: the account of what was actually seen. One run produces
   * several pictures — the meat going in, the box on day three, the slice on
   * day nine — and a single hero would throw away the two that carry the
   * argument.
   */
  images: {
    url: string;
    alt: string | null;
    caption: string | null;
  }[];
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
  /** The run's hero image, for the card. Its gallery is on the page only. */
  heroImageUrl: string | null;
  heroImageAlt: string | null;
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
      heroImageUrl: experimentsLive.heroImageUrl,
      heroImageAlt: experimentsLive.heroImageAlt,
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
    heroImageUrl: r.heroImageUrl,
    heroImageAlt: r.heroImageAlt,
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
      heroImageUrl: experimentsLive.heroImageUrl,
      heroImageAlt: experimentsLive.heroImageAlt,
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

  const [itemRows, observationRows, noteRows, imageRows] = await Promise.all([
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
        previousSubjects: notesLive.previousSubjects,
        createdAt: notesLive.createdAt,
      })
      .from(notesLive)
      .where(eq(notesLive.experimentId, row.id))
      // The note order — see `getRecipeBySlug`. `logExperiment` writes every
      // note on a run in one transaction, so this list was the one most
      // exposed to the tie: batch 2 carries three.
      .orderBy(
        asc(notesLive.sortAt),
        asc(notesLive.position),
        asc(notesLive.id),
      ),
    // A child table, so it carries no delete flag of its own and needs none
    // — its lifetime is the run's, and this read already started from a live
    // one. `position` is the order `upload_image` appends in.
    db
      .select({
        url: experimentImages.imageUrl,
        alt: experimentImages.imageAlt,
        caption: experimentImages.caption,
      })
      .from(experimentImages)
      .where(eq(experimentImages.experimentId, row.id))
      .orderBy(asc(experimentImages.position)),
  ]);

  const sourcesByNote = await noteSourcesByNote(noteRows.map((x) => x.id));

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
    heroImageUrl: row.heroImageUrl,
    heroImageAlt: row.heroImageAlt,
    images: imageRows,
    items: itemRows,
    observations: observationRows.map((o) => ({ ...o, value: n(o.value) })),
    notes: noteRows.map((x) => ({
      id: x.id,
      kind: x.kind,
      title: x.title,
      body: x.body,
      conditions: x.conditions,
      movedFrom: x.previousSubjects,
      createdAt: x.createdAt.toISOString(),
      sources: sourcesByNote.get(x.id) ?? [],
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Searching the halves that are not recipes
// ─────────────────────────────────────────────────────────────────────────

export interface ExperimentSearchResult {
  slug: string;
  title: string;
  summary: string | null;
  outcome: string | null;
  startedAt: string | null;
  recipe: { slug: string; title: string } | null;
  rank: number;
}

/**
 * Runs, by free text.
 *
 * WHY THERE IS NO GENERATED COLUMN HERE, and why that is not laziness. The
 * obvious build is a `tsvector` column on `experiments`, `GENERATED ALWAYS
 * AS … STORED`, weighting the slug with the `'simple'` configuration so it
 * is kept as typed. That is wrong, and it fails silently on the exact case
 * issue #18 reports. `websearch_to_tsquery('english', …)` STEMS its input:
 * `mixed-bone-demi-glace-batch-1` becomes a phrase query containing `mix`,
 * not `mixed`. A `'simple'` vector holds `mixed`, so the two never meet and
 * the slug that prompted the report would still return nothing. Checked on
 * the Postgres this runs against: `'simple'` is false, `'english'` is true.
 * Both sides must stem or neither may.
 *
 * So the matching is the same two-part clause `searchNotes` uses: a tsquery
 * half that stems and ranks, and an ILIKE half that catches the literal
 * substring a slug or a part-word would otherwise miss. It needs no column,
 * no trigger and no migration, and the ILIKE half is what makes an exact
 * slug pasted out of an MCP response find its record. When these tables are
 * big enough that a sequential scan hurts, the answer is one hand-authored
 * expression-index migration — drizzle-kit cannot emit those, which is why
 * `0001_search_indexes.sql` was hand-written too.
 */
export async function searchExperiments(input: {
  query?: string;
  limit?: number;
  offset?: number;
}): Promise<{ results: ExperimentSearchResult[]; total: number }> {
  const conditions = [sql`TRUE`];
  const q = input.query?.trim();

  if (q) {
    conditions.push(sql`(
      to_tsvector('english',
        coalesce(e.title, '') || ' ' ||
        coalesce(e.summary, '') || ' ' ||
        coalesce(e.outcome, ''))
        @@ websearch_to_tsquery('english', ${q})
      OR e.slug ILIKE ${'%' + q + '%'}
      OR e.title ILIKE ${'%' + q + '%'}
      OR e.summary ILIKE ${'%' + q + '%'}
      OR e.outcome ILIKE ${'%' + q + '%'}
    )`);
  }

  const where = sql.join(conditions, sql` AND `);
  const rank = q
    ? sql`ts_rank_cd(
        to_tsvector('english',
          coalesce(e.title, '') || ' ' ||
          coalesce(e.summary, '') || ' ' ||
          coalesce(e.outcome, '')),
        websearch_to_tsquery('english', ${q})
      )`
    : sql`0::float4`;
  /* Newest first, the order `listExperiments` uses, for the same reason. */
  const ordering = q
    ? sql`${rank} DESC, e.started_at DESC NULLS LAST, e.slug ASC`
    : sql`e.started_at DESC NULLS LAST, e.slug ASC`;

  /* Raw SQL, so the ESLint import ban cannot see this query: the view
     names are what keeps a deleted run out of it. `experiments_live` for
     the run itself, and `recipes_live` on the join so a run whose recipe
     went reads as having none rather than naming a deleted dish. */
  const result = await db.execute<Record<string, unknown>>(sql`
    SELECT e.slug, e.title, e.summary, e.outcome, e.started_at,
           r.slug AS recipe_slug, r.title AS recipe_title,
           ${rank} AS rank,
           COUNT(*) OVER () AS total
      FROM experiments_live e
      LEFT JOIN recipes_live r ON r.id = e.recipe_id
     WHERE ${where}
     ORDER BY ${ordering}
     LIMIT ${input.limit ?? 20}
    OFFSET ${input.offset ?? 0}
  `);

  const rows = result.rows as unknown as Record<string, unknown>[];
  return {
    total: rows.length > 0 ? Number(rows[0]!.total) : 0,
    results: rows.map((row) => ({
      slug: String(row.slug),
      title: String(row.title),
      summary: row.summary == null ? null : String(row.summary),
      outcome: row.outcome == null ? null : String(row.outcome),
      startedAt: row.started_at == null ? null : String(row.started_at),
      recipe: row.recipe_slug
        ? { slug: String(row.recipe_slug), title: String(row.recipe_title) }
        : null,
      rank: Number(row.rank ?? 0),
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Notes, as a set
// ─────────────────────────────────────────────────────────────────────────

/**
 * How much of a body a result carries.
 *
 * Long enough to tell two notes apart and to judge whether one already says
 * what you were about to write; short enough that the default page of
 * twenty is a few kilobytes rather than a few tens. `bodyLength` and
 * `truncated` come back with it, so a caller knows when to fetch the whole
 * note from its parent record.
 */
const NOTE_EXCERPT_CHARS = 240;

export interface NoteSearchResult {
  id: string;
  kind: string;
  title: string | null;
  excerpt: string;
  truncated: boolean;
  bodyLength: number;
  conditions: string[];
  sourceCount: number;
  createdAt: string;
  attachedTo: {
    type: 'recipe' | 'revision' | 'step' | 'ingredient' | 'experiment';
    slug: string | null;
    title: string | null;
    revisionNumber: number | null;
  };
  rank: number;
}

/**
 * Every note, searchable, whatever it hangs off.
 *
 * WHY THIS EXISTS. Every other record type could be enumerated —
 * `list_ingredients`, `list_categories`, `list_experiments`,
 * `search_recipes` — and notes could not. The only way to reach one was to
 * call `get_recipe`, `get_ingredient` or `get_experiment` on whatever it
 * happened to be attached to, so you had to know where a note was in order
 * to find it. At the sizes this store already holds that is seventy-odd
 * calls to answer "what do I know about collagen", which no agent will
 * spend speculatively. The store accumulated judgement faster than it could
 * retrieve it, and notes were the one record type with no duplicate check.
 *
 * NEITHER `noteBelongsToRecipe` NOR `noteRecipeId` MAY BE REUSED HERE, and
 * this is the trap to avoid. Both resolve a revision note only through
 * `recipes.current_revision_id`, so both silently drop every note on a
 * superseded revision. That is correct for `/science`, which draws the
 * recipe as it stands. It is wrong here: `reviseRecipe` and
 * `backfillRevision` attach their notes to a REVISION, so on any recipe
 * that has been revised once, the rule those two encode hides exactly the
 * notes an agent is looking for. The eight joins below resolve a note to
 * its recipe through ANY revision.
 *
 * NO STATUS FILTER, unlike `searchRecipes`, which opens with
 * `r.status = 'active'`. `getStats` counts notes with no such predicate,
 * and the suite pins `counts.notes` to this function's `total`. A status
 * filter here would break that agreement the first time a recipe is
 * archived, and it would hide a note whose lesson outlives its dish.
 *
 * THE ORDER RUNS OPPOSITE TO EVERY OTHER NOTE READ, deliberately. The five
 * reads that return the notes of ONE subject order `created_at, position,
 * id` ascending, because there a note holds a place in a list a reader goes
 * through in order. This read crosses subjects and answers "what is here",
 * which is the question `listRecipes` and `listExperiments` answer newest
 * first. `position` and `id` stay as tiebreaks so that paging is stable —
 * `created_at` is fixed for a whole transaction, so a call that wrote four
 * notes gives all four the same timestamp.
 */
export async function searchNotes(
  input: SearchNotesInput,
): Promise<{ results: NoteSearchResult[]; total: number }> {
  const conditions = [sql`TRUE`];

  const q = input.query?.trim();
  if (q) {
    /* No tsvector on `notes`. A generated column and a GIN index are the
       answer when this table is large enough to need one; at the sizes
       here every join is on a primary key and the planner reads the table
       either way. The tsquery half ranks and stems, the ILIKE half catches
       the substring a slug or a part-word would miss. */
    conditions.push(sql`(
      to_tsvector('english', coalesce(n.title, '') || ' ' || n.body)
        @@ websearch_to_tsquery('english', ${q})
      OR n.title ILIKE ${'%' + q + '%'}
      OR n.body ILIKE ${'%' + q + '%'}
    )`);
  }
  if (input.kind) {
    conditions.push(sql`n.kind = ${input.kind}`);
  }
  if (input.recipeSlug) {
    /* Through any revision, not only the current one — see the note above.
       A run of the recipe is NOT included: a note on a batch is about that
       batch, and `experimentSlug` asks for those. */
    conditions.push(
      sql`COALESCE(rec.slug, rvr.slug, srv.slug) = ${input.recipeSlug}`,
    );
  }
  if (input.ingredientSlug) {
    conditions.push(sql`ing.slug = ${input.ingredientSlug}`);
  }
  if (input.experimentSlug) {
    conditions.push(sql`exp.slug = ${input.experimentSlug}`);
  }

  const where = sql.join(conditions, sql` AND `);

  /* A bare integer in ORDER BY is an ordinal position in Postgres, so the
     no-query case drops the rank term rather than ordering by a constant.
     The EXPRESSION is interpolated into ORDER BY, never the output alias:
     `rank` is also a window-function name, and the house pattern in
     `searchRecipes` sidesteps the question entirely. */
  const rank = q
    ? sql`ts_rank_cd(
        to_tsvector('english', coalesce(n.title, '') || ' ' || n.body),
        websearch_to_tsquery('english', ${q})
      )`
    : sql`0::float4`;
  const ordering = q
    ? sql`${rank} DESC, n.created_at DESC, n.position ASC, n.id ASC`
    : sql`n.created_at DESC, n.position ASC, n.id ASC`;

  /* Every table in this query is a `_live` view for the same reason
     `searchExperiments` uses them: the import ban in `eslint.config.mjs`
     reads imports and cannot see inside a template literal, so the filter
     here is the view name. The child tables — `recipe_steps` and
     `note_sources` — carry no flag of their own and reach the caller
     through a live parent. */
  const result = await db.execute<Record<string, unknown>>(sql`
    SELECT n.id, n.kind, n.title, n.body, n.conditions, n.created_at,
           n.recipe_id, n.revision_id, n.step_id, n.ingredient_id,
           n.experiment_id,
           rec.slug  AS recipe_slug,       rec.title  AS recipe_title,
           rvr.slug  AS revision_recipe_slug,
           rvr.title AS revision_recipe_title,
           rv.revision_number AS revision_number,
           srv.slug  AS step_recipe_slug,
           srv.title AS step_recipe_title,
           sr.revision_number AS step_revision_number,
           ing.slug  AS ingredient_slug,   ing.name   AS ingredient_name,
           exp.slug  AS experiment_slug,   exp.title  AS experiment_title,
           (SELECT COUNT(*) FROM note_sources ns WHERE ns.note_id = n.id)
             AS source_count,
           ${rank} AS rank,
           COUNT(*) OVER () AS total
      FROM notes_live n
      LEFT JOIN recipes_live rec ON rec.id = n.recipe_id
      LEFT JOIN recipe_revisions_live rv ON rv.id = n.revision_id
      LEFT JOIN recipes_live rvr ON rvr.id = rv.recipe_id
      LEFT JOIN recipe_steps st ON st.id = n.step_id
      LEFT JOIN recipe_revisions_live sr ON sr.id = st.revision_id
      LEFT JOIN recipes_live srv ON srv.id = sr.recipe_id
      LEFT JOIN ingredients_live ing ON ing.id = n.ingredient_id
      LEFT JOIN experiments_live exp ON exp.id = n.experiment_id
     WHERE ${where}
     ORDER BY ${ordering}
     LIMIT ${input.limit}
    OFFSET ${input.offset}
  `);

  const rows = result.rows as unknown as Record<string, unknown>[];
  const str = (value: unknown): string | null =>
    value == null ? null : String(value);
  const num = (value: unknown): number | null =>
    value == null ? null : Number(value);

  return {
    total: rows.length > 0 ? Number(rows[0]!.total) : 0,
    results: rows.map((row) => {
      const body = String(row.body ?? '');
      const attachedTo: NoteSearchResult['attachedTo'] = row.recipe_id
        ? {
            type: 'recipe',
            slug: str(row.recipe_slug),
            title: str(row.recipe_title),
            revisionNumber: null,
          }
        : row.revision_id
          ? {
              type: 'revision',
              slug: str(row.revision_recipe_slug),
              title: str(row.revision_recipe_title),
              revisionNumber: num(row.revision_number),
            }
          : row.step_id
            ? {
                type: 'step',
                slug: str(row.step_recipe_slug),
                title: str(row.step_recipe_title),
                revisionNumber: num(row.step_revision_number),
              }
            : row.ingredient_id
              ? {
                  type: 'ingredient',
                  slug: str(row.ingredient_slug),
                  /* `ingredients` has no `title`; its name is the title. */
                  title: str(row.ingredient_name),
                  revisionNumber: null,
                }
              : {
                  type: 'experiment',
                  slug: str(row.experiment_slug),
                  title: str(row.experiment_title),
                  revisionNumber: null,
                };

      return {
        id: String(row.id),
        kind: String(row.kind),
        title: str(row.title),
        excerpt: body.slice(0, NOTE_EXCERPT_CHARS),
        truncated: body.length > NOTE_EXCERPT_CHARS,
        bodyLength: body.length,
        conditions: (row.conditions as string[] | null) ?? [],
        /* The only signal that an ingredient or a run note carries a
           citation at all. */
        sourceCount: Number(row.source_count ?? 0),
        /* ISO, whichever driver answered. node-postgres parses a
           timestamptz into a Date; Neon's serverless driver can hand back
           the raw Postgres text. Returning whichever arrived would make
           this field's format depend on where the app is deployed. */
        createdAt: new Date(row.created_at as string | Date).toISOString(),
        attachedTo,
        rank: Number(row.rank ?? 0),
      };
    }),
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
        asc(notesLive.sortAt),
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
    .orderBy(asc(notesLive.sortAt), asc(notesLive.position), asc(notesLive.id));

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

  const [sourceRows, appliedInRows, variantRows] = await Promise.all([
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
    // says so depends on the kind. An *incoming* `references` or
    // `derived_from` means the other recipe was built on this one. An
    // *outgoing* `component_of` means the same thing the other way round —
    // "demi-glace is a component of the Wellington" is written from
    // demi-glace, and it is the Wellington that applies demi-glace. Reading
    // every incoming edge, as the first draft did, printed that one
    // backwards. `pairs_with` is an association in neither direction and is
    // not an application, so it is left out. This is D-05's table, and it
    // lost a row when `variant_of` left this table for a column of its own:
    // a variation is still an application of the study it varies, and the
    // query below it picks those up.
    db
      .select(recipeSummaryColumns)
      .from(recipeLinks)
      .innerJoin(
        recipesLive,
        or(
          and(
            eq(recipesLive.id, recipeLinks.fromRecipeId),
            eq(recipeLinks.toRecipeId, recipe.id),
            inArray(recipeLinks.kind, ['references', 'derived_from']),
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
    // The variations of this study, which D-05's incoming `variant_of` row
    // used to cover. A query of its own rather than a fourth arm of the `or`
    // above, because that one reads `FROM recipe_links` — a variation that
    // holds no link row at all would never reach the join, and a variation
    // usually holds none.
    db
      .select(recipeSummaryColumns)
      .from(recipesLive)
      .leftJoin(
        recipeRevisionsLive,
        eq(recipeRevisionsLive.id, recipesLive.currentRevisionId),
      )
      .where(eq(recipesLive.variantOfId, recipe.id))
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
    ...new Map(
      [...appliedInRows, ...variantRows].map((row) => [row.id, row]),
    ).values(),
  ].sort((a, b) => a.title.localeCompare(b.title));

  const [appliedTerms, appliedParents] = await Promise.all([
    attachTerms(appliedIn),
    attachVariantOf(appliedIn),
  ]);

  return {
    slug: recipe.slug,
    title: recipe.title,
    subtitle: recipe.subtitle,
    summary: recipe.summary,
    kind: recipe.kind,
    mechanisms,
    citations,
    appliedIn: appliedIn.map((row) =>
      toSummary(row, appliedTerms.get(row.id) ?? [], appliedParents),
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
// Images
// ─────────────────────────────────────────────────────────────────────────

export interface ImageView {
  id: string;
  /** Where the bytes are. Only `/images/[id]` uses it, to redirect. */
  blobUrl: string;
  mimeType: string;
  alt: string;
  caption: string | null;
  width: number;
  height: number;
  bytes: number;
  /** Smaller copies for `?w=`. Empty for a picture stored before them. */
  renditions: ImageRendition[];
}

/**
 * One stored picture, or null when there is no live row with that id.
 *
 * The only caller is the route handler at `/images/[id]`, and the `_live`
 * view is the whole mechanism: a deleted image row makes that address 404,
 * which makes every recipe, ingredient, tag, run and stored step that names
 * it stop showing a picture at once — without a single one of those rows
 * being rewritten. `src/db/schema.ts` § `images` is the argument for it.
 *
 * The id is not validated as a uuid here. It arrives from a URL segment, so
 * anything can be in it; Postgres refuses a malformed uuid on the comparison
 * and the handler turns that into the same 404 it would have given anyway.
 */
export async function getImage(id: string): Promise<ImageView | null> {
  // A uuid comparison against a value that is not one raises `22P02` rather
  // than matching nothing, and a 500 on a mistyped address is worse than a
  // 404 on one. The shape check is cheap and keeps the failure honest.
  if (
    !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
      id,
    )
  ) {
    return null;
  }

  const found = await db
    .select({
      id: imagesLive.id,
      blobUrl: imagesLive.blobUrl,
      mimeType: imagesLive.mimeType,
      alt: imagesLive.alt,
      caption: imagesLive.caption,
      width: imagesLive.width,
      height: imagesLive.height,
      bytes: imagesLive.bytes,
      renditions: imagesLive.renditions,
    })
    .from(imagesLive)
    .where(eq(imagesLive.id, id))
    .limit(1);

  return found[0] ?? null;
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
