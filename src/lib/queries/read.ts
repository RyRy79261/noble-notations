import 'server-only';

/**
 * Read path.
 *
 * Every page and every read-only MCP tool goes through these functions, so
 * the site and the connector can never disagree about what a recipe is.
 * Results are plain serialisable objects — numerics are converted out of
 * Postgres' string representation here rather than in twelve call sites.
 */
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
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
  uses: string[];
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

  const usesByStep = new Map<string, string[]>();
  for (const row of stepUses) {
    const list = usesByStep.get(row.stepId) ?? [];
    list.push(row.name);
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

export async function listExperiments(): Promise<
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
    .orderBy(desc(experiments.startedAt));

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
