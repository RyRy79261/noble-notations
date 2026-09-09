import 'server-only';

/**
 * Read path.
 *
 * Every page and every read-only MCP tool goes through these functions, so
 * the site and the connector can never disagree about what a recipe is.
 * Results are plain serialisable objects — numerics are converted out of
 * Postgres' string representation here rather than in twelve call sites.
 */
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import type { SQLWrapper } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  experimentItems,
  experimentObservations,
  experiments,
  ingredientRelations,
  ingredients,
  noteSources,
  notes,
  recipeIngredients,
  recipeLinks,
  recipeRevisions,
  recipeStepIngredients,
  recipeSteps,
  recipeTerms,
  recipes,
  taxonomyTerms,
} from '@/db/schema';
import { slugify } from '@/lib/domain/slug';
import {
  formatAggregate,
  formatIngredientLine,
  quantityBucket,
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
  createdAt: string;
  sources: {
    url: string | null;
    title: string | null;
    citation: string | null;
    accessedAt: string | null;
  }[];
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
  id: recipes.id,
  slug: recipes.slug,
  title: recipes.title,
  subtitle: recipes.subtitle,
  summary: recipes.summary,
  kind: recipes.kind,
  heroImageUrl: recipes.heroImageUrl,
  heroImageAlt: recipes.heroImageAlt,
  updatedAt: recipes.updatedAt,
  revisionNumber: recipeRevisions.revisionNumber,
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
      id: taxonomyTerms.id,
      facet: taxonomyTerms.facet,
      slug: taxonomyTerms.slug,
      label: taxonomyTerms.label,
      description: taxonomyTerms.description,
    })
    .from(recipeTerms)
    .innerJoin(taxonomyTerms, eq(taxonomyTerms.id, recipeTerms.termId))
    .where(
      inArray(
        recipeTerms.recipeId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(desc(recipeTerms.isPrimary), asc(taxonomyTerms.label));

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
    .from(recipes)
    .leftJoin(
      recipeRevisions,
      eq(recipeRevisions.id, recipes.currentRevisionId),
    )
    .where(
      options?.kind
        ? and(
            eq(recipes.status, 'active'),
            eq(recipes.kind, options.kind as 'recipe'),
          )
        : eq(recipes.status, 'active'),
    )
    .orderBy(desc(recipes.updatedAt))
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
          JOIN taxonomy_terms t ON t.id = rt.term_id
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
        LEFT JOIN ingredients i ON i.id = ri.ingredient_id
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
      FROM recipes r
      LEFT JOIN recipe_revisions rev ON rev.id = r.current_revision_id
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

export async function getRecipeBySlug(
  slug: string,
  revisionNumber?: number,
): Promise<RecipeView | null> {
  const found = await db
    .select({
      id: recipes.id,
      slug: recipes.slug,
      title: recipes.title,
      subtitle: recipes.subtitle,
      summary: recipes.summary,
      kind: recipes.kind,
      status: recipes.status,
      heroImageUrl: recipes.heroImageUrl,
      heroImageAlt: recipes.heroImageAlt,
      originNote: recipes.originNote,
      currentRevisionId: recipes.currentRevisionId,
      createdAt: recipes.createdAt,
      updatedAt: recipes.updatedAt,
    })
    .from(recipes)
    .where(eq(recipes.slug, slug))
    .limit(1);

  const recipe = found[0];
  if (!recipe) return null;

  // Newest first by when the version existed, not by when the row was
  // written. A revision backfilled today can describe a recipe from years
  // ago, and listing it at the top would make the history read backwards.
  // The revision number breaks ties and keeps the order stable.
  const revisionRows = await db
    .select()
    .from(recipeRevisions)
    .where(eq(recipeRevisions.recipeId, recipe.id))
    .orderBy(
      desc(
        sql`COALESCE(${recipeRevisions.occurredAt}, ${recipeRevisions.createdAt})`,
      ),
      desc(recipeRevisions.revisionNumber),
    );

  const revision =
    revisionNumber != null
      ? revisionRows.find((r) => r.revisionNumber === revisionNumber)
      : (revisionRows.find((r) => r.id === recipe.currentRevisionId) ??
        revisionRows[0]);
  if (!revision) return null;

  const [ingredientRows, stepRows, noteRows, termMap] = await Promise.all([
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
        ingredientSlug: ingredients.slug,
        ingredientName: ingredients.name,
        ingredientCategory: ingredients.category,
      })
      .from(recipeIngredients)
      .leftJoin(ingredients, eq(ingredients.id, recipeIngredients.ingredientId))
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
        techniqueSlug: taxonomyTerms.slug,
        techniqueLabel: taxonomyTerms.label,
      })
      .from(recipeSteps)
      .leftJoin(
        taxonomyTerms,
        eq(taxonomyTerms.id, recipeSteps.techniqueTermId),
      )
      .where(eq(recipeSteps.revisionId, revision.id))
      .orderBy(asc(recipeSteps.position)),
    // Notes on the recipe itself and on the revision being displayed.
    db
      .select({
        id: notes.id,
        kind: notes.kind,
        title: notes.title,
        body: notes.body,
        createdAt: notes.createdAt,
      })
      .from(notes)
      .where(
        sql`${notes.recipeId} = ${recipe.id} OR ${notes.revisionId} = ${revision.id}`,
      )
      .orderBy(asc(notes.createdAt)),
    attachTerms([{ id: recipe.id }]),
  ]);

  const stepUses = stepRows.length
    ? await db
        .select({
          stepId: recipeStepIngredients.stepId,
          recipeIngredientId: recipeStepIngredients.recipeIngredientId,
          name: sql<string>`COALESCE(${ingredients.name}, ${recipeIngredients.rawText})`,
        })
        .from(recipeStepIngredients)
        .innerJoin(
          recipeIngredients,
          eq(recipeIngredients.id, recipeStepIngredients.recipeIngredientId),
        )
        .leftJoin(
          ingredients,
          eq(ingredients.id, recipeIngredients.ingredientId),
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
      .innerJoin(recipes, eq(recipes.id, recipeLinks.toRecipeId))
      .leftJoin(
        recipeRevisions,
        eq(recipeRevisions.id, recipes.currentRevisionId),
      )
      .where(eq(recipeLinks.fromRecipeId, recipe.id)),
    db
      .select({ linkKind: recipeLinks.kind, ...recipeSummaryColumns })
      .from(recipeLinks)
      .innerJoin(recipes, eq(recipes.id, recipeLinks.fromRecipeId))
      .leftJoin(
        recipeRevisions,
        eq(recipeRevisions.id, recipes.currentRevisionId),
      )
      .where(eq(recipeLinks.toRecipeId, recipe.id)),
    db
      .select({
        slug: experiments.slug,
        title: experiments.title,
        startedAt: experiments.startedAt,
      })
      .from(experiments)
      .where(eq(experiments.recipeId, recipe.id))
      .orderBy(desc(experiments.startedAt)),
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
      createdAt: row.createdAt.toISOString(),
      sources: sourcesByNote.get(row.id) ?? [],
    })),
    revisions: revisionRows.map((r) => ({
      revisionNumber: r.revisionNumber,
      rationale: r.rationale,
      source: r.source,
      createdAt: r.createdAt.toISOString(),
      occurredAt: r.occurredAt ? r.occurredAt.toISOString() : null,
      backfilled: r.occurredAt !== null,
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
export async function getRecipeIdentity(
  slug: string,
): Promise<{ slug: string; title: string } | null> {
  const rows = await db
    .select({ slug: recipes.slug, title: recipes.title })
    .from(recipes)
    .where(eq(recipes.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

export async function listRecipeSlugs(): Promise<string[]> {
  const rows = await db
    .select({ slug: recipes.slug })
    .from(recipes)
    .where(eq(recipes.status, 'active'));
  return rows.map((r) => r.slug);
}

// ─────────────────────────────────────────────────────────────────────────
// Taxonomy
// ─────────────────────────────────────────────────────────────────────────

export interface TermWithCount extends TermView {
  recipeCount: number;
}

export async function listCategories(
  facet?: CategoryType,
): Promise<TermWithCount[]> {
  const rows = await db
    .select({
      id: taxonomyTerms.id,
      facet: taxonomyTerms.facet,
      slug: taxonomyTerms.slug,
      label: taxonomyTerms.label,
      description: taxonomyTerms.description,
      recipeCount: sql<number>`COUNT(${recipeTerms.recipeId})`,
    })
    .from(taxonomyTerms)
    .leftJoin(recipeTerms, eq(recipeTerms.termId, taxonomyTerms.id))
    .where(facet ? eq(taxonomyTerms.facet, facet) : sql`true`)
    .groupBy(
      taxonomyTerms.id,
      taxonomyTerms.facet,
      taxonomyTerms.slug,
      taxonomyTerms.label,
      taxonomyTerms.description,
    )
    .orderBy(
      desc(sql`COUNT(${recipeTerms.recipeId})`),
      asc(taxonomyTerms.label),
    );

  return rows.map((r) => ({
    id: r.id,
    categoryType: r.facet as CategoryType,
    slug: r.slug,
    label: r.label,
    description: r.description,
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
    .from(taxonomyTerms)
    .where(and(eq(taxonomyTerms.facet, facet), eq(taxonomyTerms.slug, slug)))
    .limit(1);
  const term = found[0];
  if (!term) return null;

  const rows = await db
    .select(recipeSummaryColumns)
    .from(recipeTerms)
    .innerJoin(recipes, eq(recipes.id, recipeTerms.recipeId))
    .leftJoin(
      recipeRevisions,
      eq(recipeRevisions.id, recipes.currentRevisionId),
    )
    .where(and(eq(recipeTerms.termId, term.id), eq(recipes.status, 'active')))
    .orderBy(desc(recipes.updatedAt));

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
        .from(taxonomyTerms)
        .where(eq(taxonomyTerms.id, term.parentId))
        .limit(1)
    : [];

  const childRows = await db
    .select()
    .from(taxonomyTerms)
    .where(eq(taxonomyTerms.parentId, term.id))
    .orderBy(taxonomyTerms.label);

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
      slug: ingredients.slug,
      name: ingredients.name,
      plural: ingredients.plural,
      category: ingredients.category,
      description: ingredients.description,
      densityGPerMl: ingredients.densityGPerMl,
      defaultUnit: ingredients.defaultUnit,
      aliases: ingredients.aliases,
      recipeCount: sql<number>`COUNT(DISTINCT r.id)`,
    })
    .from(ingredients)
    .leftJoin(
      sql`recipe_ingredients ri`,
      sql`ri.ingredient_id = ${ingredients.id}`,
    )
    .leftJoin(
      sql`recipes r`,
      sql`r.current_revision_id = ri.revision_id AND r.status = 'active'`,
    )
    .groupBy(
      ingredients.id,
      ingredients.slug,
      ingredients.name,
      ingredients.plural,
      ingredients.category,
      ingredients.description,
      ingredients.densityGPerMl,
      ingredients.defaultUnit,
      ingredients.aliases,
    )
    .orderBy(desc(sql`COUNT(DISTINCT r.id)`), asc(ingredients.name));

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
    .from(ingredients)
    .where(eq(ingredients.slug, slug))
    .limit(1);
  const row = found[0];
  if (!row) return null;

  const [usedIn, subs, noteRows] = await Promise.all([
    db
      .select(recipeSummaryColumns)
      .from(recipeIngredients)
      .innerJoin(
        recipes,
        eq(recipes.currentRevisionId, recipeIngredients.revisionId),
      )
      .leftJoin(
        recipeRevisions,
        eq(recipeRevisions.id, recipes.currentRevisionId),
      )
      .where(
        and(
          eq(recipeIngredients.ingredientId, row.id),
          eq(recipes.status, 'active'),
        ),
      )
      .groupBy(
        recipes.id,
        recipes.slug,
        recipes.title,
        recipes.subtitle,
        recipes.summary,
        recipes.kind,
        recipes.heroImageUrl,
        recipes.heroImageAlt,
        recipes.updatedAt,
        recipeRevisions.revisionNumber,
      )
      .orderBy(desc(recipes.updatedAt)),
    db
      .select({
        slug: ingredients.slug,
        name: ingredients.name,
        note: ingredientRelations.note,
      })
      .from(ingredientRelations)
      .innerJoin(
        ingredients,
        eq(ingredients.id, ingredientRelations.toIngredientId),
      )
      .where(
        and(
          eq(ingredientRelations.fromIngredientId, row.id),
          eq(ingredientRelations.kind, 'substitute'),
        ),
      ),
    db
      .select({
        id: notes.id,
        kind: notes.kind,
        title: notes.title,
        body: notes.body,
        createdAt: notes.createdAt,
      })
      .from(notes)
      .where(eq(notes.ingredientId, row.id))
      .orderBy(asc(notes.createdAt)),
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
}): Promise<
  Pick<ExperimentView, 'slug' | 'title' | 'summary' | 'startedAt' | 'recipe'>[]
> {
  const rows = await db
    .select({
      slug: experiments.slug,
      title: experiments.title,
      summary: experiments.summary,
      startedAt: experiments.startedAt,
      recipeSlug: recipes.slug,
      recipeTitle: recipes.title,
    })
    .from(experiments)
    .leftJoin(recipes, eq(recipes.id, experiments.recipeId))
    .where(
      options?.recipeSlug ? eq(recipes.slug, options.recipeSlug) : undefined,
    )
    // Newest first. The slug breaks the tie, because two runs started on
    // the same day are otherwise ordered by whatever the planner returns
    // and the grid reshuffles between renders.
    .orderBy(desc(experiments.startedAt), asc(experiments.slug));

  return rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    summary: r.summary,
    startedAt: r.startedAt,
    recipe: r.recipeSlug ? { slug: r.recipeSlug, title: r.recipeTitle! } : null,
  }));
}

export async function getExperiment(
  slug: string,
): Promise<ExperimentView | null> {
  const found = await db
    .select({
      id: experiments.id,
      slug: experiments.slug,
      title: experiments.title,
      summary: experiments.summary,
      startedAt: experiments.startedAt,
      completedAt: experiments.completedAt,
      scaleFactor: experiments.scaleFactor,
      outcome: experiments.outcome,
      costTotal: experiments.costTotal,
      currency: experiments.currency,
      recipeSlug: recipes.slug,
      recipeTitle: recipes.title,
    })
    .from(experiments)
    .leftJoin(recipes, eq(recipes.id, experiments.recipeId))
    .where(eq(experiments.slug, slug))
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
        id: notes.id,
        kind: notes.kind,
        title: notes.title,
        body: notes.body,
        createdAt: notes.createdAt,
      })
      .from(notes)
      .where(eq(notes.experimentId, row.id))
      .orderBy(asc(notes.createdAt)),
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
  ${notes.recipeId},
  (SELECT r.id FROM recipes r
     JOIN recipe_revisions rev ON rev.id = r.current_revision_id
    WHERE rev.id = ${notes.revisionId}),
  (SELECT r.id FROM recipes r
     JOIN recipe_steps st ON st.revision_id = r.current_revision_id
    WHERE st.id = ${notes.stepId}),
  (SELECT ex.recipe_id FROM experiments ex
    WHERE ex.id = ${notes.experimentId})
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
    ${notes.recipeId} = ${recipeId}
    OR ${notes.revisionId} = (
      SELECT r.current_revision_id FROM recipes r WHERE r.id = ${recipeId})
    OR ${notes.stepId} IN (
      SELECT st.id FROM recipe_steps st
        JOIN recipes r ON r.current_revision_id = st.revision_id
       WHERE r.id = ${recipeId})
    OR ${notes.experimentId} IN (
      SELECT ex.id FROM experiments ex WHERE ex.recipe_id = ${recipeId})
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
   * The conditions, as separate values: 232 °C, 45 MIN, SINGLE LAYER ON A
   * RACK. R-SCR-41 requires them separate rather than written into a
   * sentence.
   *
   * **Always empty today.** `notes` holds a kind, a title and a body and
   * nothing else, so there is nowhere to read a temperature, a time or a
   * depth from. D-02 in design/DECISIONS.md parks that schema change with
   * the repository owner. The field is here so the block is built now and
   * one additive migration fills it; a caller draws no row for an empty
   * list.
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
        id: notes.id,
        kind: notes.kind,
        title: notes.title,
        body: notes.body,
        recipeSlug: recipes.slug,
        recipeTitle: recipes.title,
      })
      .from(notes)
      .innerJoin(recipes, eq(recipes.id, noteRecipeId))
      .where(
        and(
          inArray(notes.kind, ['science', 'research']),
          eq(recipes.status, 'active'),
        ),
      )
      .orderBy(asc(recipes.title), asc(notes.createdAt), asc(notes.id)),
    db
      .select({
        slug: recipes.slug,
        title: recipes.title,
        summary: recipes.summary,
        kind: recipes.kind,
      })
      .from(recipes)
      .where(
        and(
          eq(recipes.status, 'active'),
          or(
            eq(recipes.kind, 'research'),
            // A preparation with a mechanism on it is a study too — the
            // demi-glace case the design draws. Listing only the research
            // recipes left `/science/demi-glace` answering with no card
            // anywhere that reaches it.
            sql`EXISTS (SELECT 1 FROM ${notes}
                  WHERE ${notes.kind} = 'science'
                    AND ${noteBelongsToRecipe(recipes.id)})`,
          ),
        ),
      )
      .orderBy(asc(recipes.title)),
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
        conditions: [],
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
      id: recipes.id,
      slug: recipes.slug,
      title: recipes.title,
      subtitle: recipes.subtitle,
      summary: recipes.summary,
      kind: recipes.kind,
    })
    .from(recipes)
    .where(eq(recipes.slug, recipeSlug))
    .limit(1);

  const recipe = found[0];
  if (!recipe) return null;

  // Every note of the recipe, not only its science: the reference list at
  // the foot of a study is the study's citations, and a research note is
  // required to carry sources where a science note is not.
  const noteRows = await db
    .select({
      id: notes.id,
      kind: notes.kind,
      title: notes.title,
      body: notes.body,
      experimentId: notes.experimentId,
    })
    .from(notes)
    .where(noteBelongsToRecipe(recipe.id))
    .orderBy(asc(notes.createdAt), asc(notes.id));

  const mechanisms: MechanismView[] = noteRows
    .filter((row) => row.kind === 'science')
    .map((row, index) => ({
      id: row.id,
      code: `M${index + 1}`,
      title: row.title,
      body: row.body,
      conditions: [],
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
          .orderBy(asc(noteSources.createdAt), asc(noteSources.id))
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
        recipes,
        or(
          and(
            eq(recipes.id, recipeLinks.fromRecipeId),
            eq(recipeLinks.toRecipeId, recipe.id),
            inArray(recipeLinks.kind, [
              'references',
              'derived_from',
              'variant_of',
            ]),
          ),
          and(
            eq(recipes.id, recipeLinks.toRecipeId),
            eq(recipeLinks.fromRecipeId, recipe.id),
            eq(recipeLinks.kind, 'component_of'),
          ),
        ),
      )
      .leftJoin(
        recipeRevisions,
        eq(recipeRevisions.id, recipes.currentRevisionId),
      )
      .where(
        or(
          eq(recipeLinks.toRecipeId, recipe.id),
          eq(recipeLinks.fromRecipeId, recipe.id),
        ),
      )
      .orderBy(asc(recipes.title)),
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
      (SELECT COUNT(*) FROM recipes WHERE status = 'active') AS recipes,
      (SELECT COUNT(*) FROM recipe_revisions)                AS revisions,
      (SELECT COUNT(*) FROM ingredients)                     AS ingredients,
      (SELECT COUNT(*) FROM taxonomy_terms)                  AS terms,
      (SELECT COUNT(*) FROM notes)                           AS notes,
      (SELECT COUNT(*) FROM experiments)                     AS experiments
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
      slug: recipes.slug,
      title: recipes.title,
      revisionId: recipes.currentRevisionId,
    })
    .from(recipes)
    .where(inArray(recipes.slug, wanted));

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
      unit: recipeIngredients.unit,
      optional: recipeIngredients.optional,
      rawText: recipeIngredients.rawText,
      preparation: recipeIngredients.preparation,
      ingredientSlug: ingredients.slug,
      ingredientName: ingredients.name,
      ingredientCategory: ingredients.category,
    })
    .from(recipeIngredients)
    .leftJoin(ingredients, eq(ingredients.id, recipeIngredients.ingredientId))
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
    // so they key on their own text rather than being dropped.
    const name = line.ingredientName ?? line.rawText;
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

    entry.from.push({
      slug: source.slug,
      title: source.title,
      text: formatIngredientLine({
        quantity,
        unit: line.unit,
        name,
        preparation: line.preparation,
        optional: line.optional,
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
