import 'server-only';

/**
 * Write path for the repository.
 *
 * Every function here is the *only* supported way to change its part of the
 * model, and each one runs in a single transaction. The rule that shapes all
 * of it: a recipe's ingredients and steps are never edited in place. Refining
 * a recipe appends a revision and moves `recipes.current_revision_id`, so the
 * history of how a dish got good is preserved rather than overwritten.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { withTransaction, type TransactionClient } from '@/db/client';
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
import { slugify, uniqueSlug } from '@/lib/domain/slug';
import {
  formatIngredientLine,
  normaliseUnit,
  unitKind,
} from '@/lib/domain/units';
import type {
  AddNoteInput,
  BackfillRevisionInput,
  CreateRecipeInput,
  IngredientLineInput,
  LogExperimentInput,
  NoteInput,
  ReviseRecipeInput,
  StepInput,
  CategoryType,
  CategoriesInput,
  UpsertIngredientInput,
  UpsertCategoryInput,
} from '@/lib/domain/schemas';

type Tx = TransactionClient;

/** Postgres `numeric` round-trips as a string in drizzle. */
function num(value: number | null | undefined): string | null {
  return value == null ? null : String(value);
}

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

// ─────────────────────────────────────────────────────────────────────────
// Resolution helpers — turn the names an agent writes into canonical rows
// ─────────────────────────────────────────────────────────────────────────

/**
 * Find (or create) the canonical ingredient for a written name.
 *
 * Match order is slug, then exact name, then alias. Creating on a miss is
 * deliberate: refusing an unknown ingredient would mean a recipe cannot be
 * saved until the ingredient list is curated first, which in practice means
 * the recipe never gets saved. An auto-created row is a stub with category
 * `other` that `upsert_ingredient` can enrich later.
 */
async function resolveIngredient(
  tx: Tx,
  name: string,
): Promise<{ id: string; canonicalName: string }> {
  const trimmed = name.trim();
  const slug = slugify(trimmed);

  const bySlug = await tx
    .select({ id: ingredients.id, name: ingredients.name })
    .from(ingredients)
    .where(eq(ingredients.slug, slug))
    .limit(1);
  if (bySlug[0]) return { id: bySlug[0].id, canonicalName: bySlug[0].name };

  const byNameOrAlias = await tx
    .select({ id: ingredients.id, name: ingredients.name })
    .from(ingredients)
    .where(
      sql`lower(${ingredients.name}) = ${trimmed.toLowerCase()}
          OR EXISTS (
            SELECT 1 FROM unnest(${ingredients.aliases}) AS a
             WHERE lower(a) = ${trimmed.toLowerCase()}
          )`,
    )
    .limit(1);
  if (byNameOrAlias[0]) {
    return { id: byNameOrAlias[0].id, canonicalName: byNameOrAlias[0].name };
  }

  const inserted = await tx
    .insert(ingredients)
    .values({ slug, name: trimmed })
    // A concurrent write may have created the same slug between the select
    // and here; take whatever is there rather than failing the whole recipe.
    .onConflictDoUpdate({
      target: ingredients.slug,
      set: { updatedAt: new Date() },
    })
    .returning({ id: ingredients.id, name: ingredients.name });
  return { id: inserted[0]!.id, canonicalName: inserted[0]!.name };
}

async function resolveIngredientId(tx: Tx, name: string): Promise<string> {
  return (await resolveIngredient(tx, name)).id;
}

/**
 * Look up an ingredient without creating one. Validation paths need this:
 * creating a row as a side effect of checking a reference would be wrong.
 */
async function findIngredientId(tx: Tx, name: string): Promise<string | null> {
  const trimmed = name.trim();
  const rows = await tx
    .select({ id: ingredients.id })
    .from(ingredients)
    .where(
      sql`${ingredients.slug} = ${slugify(trimmed)}
          OR lower(${ingredients.name}) = ${trimmed.toLowerCase()}
          OR EXISTS (
            SELECT 1 FROM unnest(${ingredients.aliases}) AS a
             WHERE lower(a) = ${trimmed.toLowerCase()}
          )`,
    )
    .limit(1);
  return rows[0]?.id ?? null;
}

/** Find (or create) a taxonomy term within a facet. */
async function resolveTermId(
  tx: Tx,
  facet: CategoryType,
  label: string,
): Promise<string> {
  const trimmed = label.trim();
  const slug = slugify(trimmed);
  const existing = await tx
    .select({ id: taxonomyTerms.id })
    .from(taxonomyTerms)
    .where(and(eq(taxonomyTerms.facet, facet), eq(taxonomyTerms.slug, slug)))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const inserted = await tx
    .insert(taxonomyTerms)
    .values({ facet, slug, label: trimmed })
    .onConflictDoUpdate({
      target: [taxonomyTerms.facet, taxonomyTerms.slug],
      set: { updatedAt: new Date() },
    })
    .returning({ id: taxonomyTerms.id });
  return inserted[0]!.id;
}

/** Replace a recipe's taxonomy assignments wholesale. */
async function applyTaxonomy(
  tx: Tx,
  recipeId: string,
  taxonomy: CategoriesInput,
): Promise<void> {
  if (!taxonomy) return;
  await tx.delete(recipeTerms).where(eq(recipeTerms.recipeId, recipeId));

  for (const [facet, labels] of Object.entries(taxonomy)) {
    if (!labels?.length) continue;
    for (const [index, label] of labels.entries()) {
      const termId = await resolveTermId(tx, facet as CategoryType, label);
      await tx
        .insert(recipeTerms)
        // The first term listed for a facet is the headline one shown on cards.
        .values({ recipeId, termId, isPrimary: index === 0 })
        .onConflictDoNothing();
    }
  }
}

/**
 * Write the ingredient lines and steps for a revision, and the links between
 * them. Returns nothing — the revision is the handle for all of it.
 */
async function writeRevisionBody(
  tx: Tx,
  revisionId: string,
  ingredientLines: IngredientLineInput[],
  steps: StepInput[],
): Promise<void> {
  /**
   * Ingredient-line id keyed by every name a step might reference it under.
   *
   * Both the name as written and the canonical ingredient name are indexed,
   * because they routinely differ: a line written as "Chinkiang vinegar"
   * resolves to the ingredient "Black malt vinegar" via its alias. Steps
   * arriving from a caller use the written name; steps carried forward from
   * a previous revision come back carrying the canonical one. Keying on only
   * one of them silently drops the link on the other path.
   */
  const lineIdByName = new Map<string, string>();
  const indexLine = (name: string, id: string) => {
    const key = name.trim().toLowerCase();
    if (key && !lineIdByName.has(key)) lineIdByName.set(key, id);
  };

  for (const [index, line] of ingredientLines.entries()) {
    const { id: ingredientId, canonicalName } = await resolveIngredient(
      tx,
      line.name,
    );
    const unit = normaliseUnit(line.unit);
    const rawText =
      line.rawText ??
      formatIngredientLine({
        quantity: line.quantity,
        quantityMax: line.quantityMax,
        unit,
        name: line.name,
        preparation: line.preparation,
        optional: line.optional,
      });

    const inserted = await tx
      .insert(recipeIngredients)
      .values({
        revisionId,
        ingredientId,
        position: index,
        component: line.component ?? null,
        quantity: num(line.quantity),
        quantityMax: num(line.quantityMax),
        unit,
        preparation: line.preparation ?? null,
        optional: line.optional ?? false,
        note: line.note ?? null,
        rawText,
      })
      .returning({ id: recipeIngredients.id });

    indexLine(line.name, inserted[0]!.id);
    indexLine(canonicalName, inserted[0]!.id);
  }

  for (const [index, step] of steps.entries()) {
    const techniqueTermId = step.technique
      ? await resolveTermId(tx, 'technique', step.technique)
      : null;

    const inserted = await tx
      .insert(recipeSteps)
      .values({
        revisionId,
        position: index,
        phase: step.phase ?? null,
        instruction: step.instruction,
        durationMinutes: step.durationMinutes ?? null,
        durationMaxMinutes: step.durationMaxMinutes ?? null,
        temperatureC: num(step.temperatureC),
        equipment: step.equipment ?? [],
        techniqueTermId,
        imageUrl: step.imageUrl ?? null,
        imageAlt: step.imageAlt ?? null,
        note: step.note ?? null,
      })
      .returning({ id: recipeSteps.id });

    const stepId = inserted[0]!.id;
    for (const used of step.uses ?? []) {
      const lineId = lineIdByName.get(used.trim().toLowerCase());
      // Unresolvable references are rejected by the Zod schema before we get
      // here; skipping is a belt-and-braces guard for the revise path, where
      // steps can be replaced against carried-forward ingredients.
      if (!lineId) continue;
      await tx
        .insert(recipeStepIngredients)
        .values({ stepId, recipeIngredientId: lineId })
        .onConflictDoNothing();
    }
  }
}

/**
 * Insert notes and their citations against a single subject column.
 * Returns the new note ids in the order given.
 */
async function writeNotes(
  tx: Tx,
  subject: {
    recipeId?: string;
    revisionId?: string;
    stepId?: string;
    ingredientId?: string;
    experimentId?: string;
  },
  list: NoteInput[] | undefined,
): Promise<string[]> {
  const ids: string[] = [];
  for (const note of list ?? []) {
    const inserted = await tx
      .insert(notes)
      .values({
        kind: note.kind,
        title: note.title ?? null,
        body: note.body,
        recipeId: subject.recipeId ?? null,
        revisionId: subject.revisionId ?? null,
        stepId: subject.stepId ?? null,
        ingredientId: subject.ingredientId ?? null,
        experimentId: subject.experimentId ?? null,
      })
      .returning({ id: notes.id });

    const noteId = inserted[0]!.id;
    ids.push(noteId);
    for (const source of note.sources ?? []) {
      await tx.insert(noteSources).values({
        noteId,
        url: source.url ?? null,
        title: source.title ?? null,
        citation: source.citation ?? null,
        accessedAt: source.accessedAt ?? null,
      });
    }
  }
  return ids;
}

/** Replace a recipe's outgoing links. Unknown targets are reported, not silent. */
async function applyLinks(
  tx: Tx,
  fromRecipeId: string,
  links: CreateRecipeInput['links'],
): Promise<string[]> {
  if (!links) return [];
  const unresolved: string[] = [];
  await tx
    .delete(recipeLinks)
    .where(eq(recipeLinks.fromRecipeId, fromRecipeId));

  for (const link of links) {
    const target = await tx
      .select({ id: recipes.id })
      .from(recipes)
      .where(eq(recipes.slug, link.slug))
      .limit(1);
    if (!target[0]) {
      unresolved.push(link.slug);
      continue;
    }
    if (target[0].id === fromRecipeId) continue;
    await tx
      .insert(recipeLinks)
      .values({
        fromRecipeId,
        toRecipeId: target[0].id,
        kind: link.kind,
        note: link.note ?? null,
      })
      .onConflictDoNothing();
  }
  return unresolved;
}

// ─────────────────────────────────────────────────────────────────────────
// Recipes
// ─────────────────────────────────────────────────────────────────────────

export interface WriteResult {
  slug: string;
  revisionNumber: number;
  recipeId: string;
  revisionId: string;
  /** Link targets that did not exist; the write still succeeded. */
  unresolvedLinks: string[];
  /**
   * What this recipe now references that is still a bare stub.
   *
   * Naming a category or an ingredient creates it if it does not exist —
   * that is deliberate, because refusing a recipe until its vocabulary is
   * complete would make writing one a multi-round negotiation. But the
   * result said nothing about it, so one `create_recipe` quietly minted
   * seven unexplained tags and fifteen uncategorised ingredients and
   * reported success. The only reason a caller ever followed up was that it
   * had read the guide and remembered.
   *
   * Documentation asking an agent to remember is a weaker mechanism than
   * the response telling it what it owes.
   */
  needsDescription: NeedsDescription;
}

export interface NeedsDescription {
  categories: { categoryType: string; slug: string; label: string }[];
  ingredients: { slug: string; name: string; missing: string[] }[];
  /**
   * Lines written in a volume unit whose ingredient has no density, so the
   * amount cannot be converted to mass — the only unit that compares across
   * batches of different size.
   */
  needsDensity: { slug: string; name: string; unit: string }[];
}

/**
 * Look at what the recipe now references and report what is still bare.
 *
 * Deliberately a query over final state rather than a tally of what this
 * call happened to create: a term left undescribed by an earlier write is
 * exactly as incomplete, and the caller holding the recipe is the one who
 * can fix it.
 */
async function collectNeedsDescription(
  tx: Tx,
  recipeId: string,
  revisionId: string,
): Promise<NeedsDescription> {
  const termRows = await tx
    .select({
      categoryType: taxonomyTerms.facet,
      slug: taxonomyTerms.slug,
      label: taxonomyTerms.label,
      description: taxonomyTerms.description,
    })
    .from(recipeTerms)
    .innerJoin(taxonomyTerms, eq(recipeTerms.termId, taxonomyTerms.id))
    .where(eq(recipeTerms.recipeId, recipeId));

  const lineRows = await tx
    .select({
      slug: ingredients.slug,
      name: ingredients.name,
      description: ingredients.description,
      category: ingredients.category,
      aliases: ingredients.aliases,
      density: ingredients.densityGPerMl,
      unit: recipeIngredients.unit,
    })
    .from(recipeIngredients)
    .innerJoin(ingredients, eq(recipeIngredients.ingredientId, ingredients.id))
    .where(eq(recipeIngredients.revisionId, revisionId));

  const seen = new Set<string>();
  const bare: NeedsDescription['ingredients'] = [];
  const needsDensity: NeedsDescription['needsDensity'] = [];

  for (const row of lineRows) {
    if (unitKind(row.unit) === 'volume' && row.density === null) {
      if (!needsDensity.some((d) => d.slug === row.slug)) {
        needsDensity.push({
          slug: row.slug,
          name: row.name,
          unit: row.unit ?? '',
        });
      }
    }
    if (seen.has(row.slug)) continue;
    seen.add(row.slug);
    const missing: string[] = [];
    if (!row.description) missing.push('description');
    if (!row.category || row.category === 'other') missing.push('category');
    if (!row.aliases || row.aliases.length === 0) missing.push('aliases');
    if (missing.length > 0) {
      bare.push({ slug: row.slug, name: row.name, missing });
    }
  }

  return {
    categories: termRows
      .filter((row) => !row.description)
      .map(({ categoryType, slug, label }) => ({ categoryType, slug, label })),
    ingredients: bare,
    needsDensity,
  };
}

export async function createRecipe(
  input: CreateRecipeInput,
  source: 'human' | 'mcp' | 'import' = 'mcp',
): Promise<WriteResult> {
  return withTransaction(async (tx) => {
    const taken = await tx.select({ slug: recipes.slug }).from(recipes);
    const desired = input.slug ?? slugify(input.title);

    if (input.slug) {
      const clash = taken.find((r) => r.slug === input.slug);
      if (clash) {
        throw new ConflictError(
          `A recipe with slug "${input.slug}" already exists. Use revise_recipe ` +
            'to add a revision, or choose a different slug.',
        );
      }
    }
    const slug =
      input.slug ??
      uniqueSlug(
        desired,
        taken.map((r) => r.slug),
      );

    const recipeRow = await tx
      .insert(recipes)
      .values({
        slug,
        title: input.title,
        subtitle: input.subtitle ?? null,
        summary: input.summary ?? null,
        kind: input.kind ?? 'recipe',
        status: input.status ?? 'active',
        originNote: input.originNote ?? null,
        heroImageUrl: input.heroImageUrl ?? null,
        heroImageAlt: input.heroImageAlt ?? null,
      })
      .returning({ id: recipes.id });
    const recipeId = recipeRow[0]!.id;

    const revisionRow = await tx
      .insert(recipeRevisions)
      .values({
        recipeId,
        revisionNumber: 1,
        title: input.title,
        summary: input.summary ?? null,
        rationale: input.rationale ?? null,
        yieldQuantity: num(input.yieldQuantity),
        yieldUnit: input.yieldUnit ?? null,
        servings: input.servings ?? null,
        totalTimeMinutes: input.totalTimeMinutes ?? null,
        activeTimeMinutes: input.activeTimeMinutes ?? null,
        source,
      })
      .returning({ id: recipeRevisions.id });
    const revisionId = revisionRow[0]!.id;

    await writeRevisionBody(
      tx,
      revisionId,
      input.ingredients ?? [],
      input.steps ?? [],
    );
    await applyTaxonomy(tx, recipeId, input.categories);
    await writeNotes(tx, { recipeId }, input.notes);
    const unresolvedLinks = await applyLinks(tx, recipeId, input.links);

    // Set last: the search-vector trigger fires on current_revision_id and
    // needs the ingredient rows to already be there.
    await tx
      .update(recipes)
      .set({ currentRevisionId: revisionId, updatedAt: new Date() })
      .where(eq(recipes.id, recipeId));

    return {
      slug,
      revisionNumber: 1,
      recipeId,
      revisionId,
      unresolvedLinks,
      needsDescription: await collectNeedsDescription(tx, recipeId, revisionId),
    };
  });
}

export async function reviseRecipe(
  input: ReviseRecipeInput,
  source: 'human' | 'mcp' | 'import' = 'mcp',
): Promise<WriteResult> {
  return withTransaction(async (tx) => {
    const found = await tx
      .select({
        id: recipes.id,
        currentRevisionId: recipes.currentRevisionId,
        title: recipes.title,
      })
      .from(recipes)
      .where(eq(recipes.slug, input.slug))
      .limit(1);
    const recipe = found[0];
    if (!recipe) {
      throw new NotFoundError(`No recipe with slug "${input.slug}".`);
    }

    const previous = recipe.currentRevisionId
      ? (
          await tx
            .select()
            .from(recipeRevisions)
            .where(eq(recipeRevisions.id, recipe.currentRevisionId))
            .limit(1)
        )[0]
      : undefined;

    const maxRow = await tx
      .select({
        max: sql<number>`COALESCE(MAX(${recipeRevisions.revisionNumber}), 0)`,
      })
      .from(recipeRevisions)
      .where(eq(recipeRevisions.recipeId, recipe.id));
    const revisionNumber = Number(maxRow[0]?.max ?? 0) + 1;

    /** Omitted fields carry forward from the revision being superseded. */
    const carry = <T>(
      next: T | null | undefined,
      prev: T | null | undefined,
    ) => (next === undefined ? (prev ?? null) : (next ?? null));

    const title = input.title ?? previous?.title ?? recipe.title;

    const revisionRow = await tx
      .insert(recipeRevisions)
      .values({
        recipeId: recipe.id,
        revisionNumber,
        title,
        summary: carry(input.summary, previous?.summary),
        rationale: input.rationale,
        yieldQuantity: carry(
          input.yieldQuantity === undefined
            ? undefined
            : num(input.yieldQuantity),
          previous?.yieldQuantity,
        ),
        yieldUnit: carry(input.yieldUnit, previous?.yieldUnit),
        servings: carry(input.servings, previous?.servings),
        totalTimeMinutes: carry(
          input.totalTimeMinutes,
          previous?.totalTimeMinutes,
        ),
        activeTimeMinutes: carry(
          input.activeTimeMinutes,
          previous?.activeTimeMinutes,
        ),
        source,
      })
      .returning({ id: recipeRevisions.id });
    const revisionId = revisionRow[0]!.id;

    // Ingredients and steps are all-or-nothing per list. When a list is
    // omitted it is copied forward verbatim from the previous revision, so a
    // steps-only revision keeps its ingredients and vice versa.
    const ingredientLines =
      input.ingredients ??
      (previous ? await copyIngredientLines(tx, previous.id) : []);
    const stepList =
      input.steps ?? (previous ? await copySteps(tx, previous.id) : []);

    // A steps-only revision was not cross-checked by Zod (it had no
    // ingredient list to check against), so validate here where the
    // carried-forward lines are in hand.
    if (input.steps && !input.ingredients) {
      // Compare by resolved ingredient identity rather than by spelling. The
      // carried-forward lines carry canonical names while the caller writes
      // whatever they call it, and "Chinkiang vinegar" and "Black malt
      // vinegar" are the same ingredient.
      const knownNames = new Set(
        ingredientLines.map((l) => l.name.trim().toLowerCase()),
      );
      const knownIds = new Set(
        (
          await Promise.all(
            ingredientLines.map((l) => findIngredientId(tx, l.name)),
          )
        ).filter((id): id is string => id !== null),
      );

      for (const [i, step] of stepList.entries()) {
        for (const used of step.uses ?? []) {
          if (knownNames.has(used.trim().toLowerCase())) continue;
          const usedId = await findIngredientId(tx, used);
          if (usedId && knownIds.has(usedId)) continue;
          throw new ConflictError(
            `Step ${i + 1} uses "${used}", which is not in this recipe's ` +
              'ingredient list. Send `ingredients` alongside `steps` to change both.',
          );
        }
      }
    }

    await writeRevisionBody(tx, revisionId, ingredientLines, stepList);
    await applyTaxonomy(tx, recipe.id, input.categories);
    await writeNotes(tx, { revisionId }, input.notes);
    const unresolvedLinks = input.links
      ? await applyLinks(tx, recipe.id, input.links)
      : [];

    await tx
      .update(recipes)
      .set({
        title,
        ...(input.subtitle !== undefined
          ? { subtitle: input.subtitle ?? null }
          : {}),
        ...(input.summary !== undefined
          ? { summary: input.summary ?? null }
          : {}),
        ...(input.heroImageUrl !== undefined
          ? { heroImageUrl: input.heroImageUrl ?? null }
          : {}),
        ...(input.heroImageAlt !== undefined
          ? { heroImageAlt: input.heroImageAlt ?? null }
          : {}),
        currentRevisionId: revisionId,
        updatedAt: new Date(),
      })
      .where(eq(recipes.id, recipe.id));

    return {
      slug: input.slug,
      revisionNumber,
      recipeId: recipe.id,
      revisionId,
      unresolvedLinks,
      needsDescription: await collectNeedsDescription(
        tx,
        recipe.id,
        revisionId,
      ),
    };
  });
}

/**
 * Record a version of a recipe that predates the ones already stored.
 *
 * The append-only rule exists so that a recipe cannot be silently rewritten
 * — so that whatever is current can be traced back through what it came
 * from. Adding a version that came *before* everything stored does not
 * break that rule: it does not change what is current and it does not touch
 * a stored revision. It only fills in history that was never written down.
 *
 * Two things keep it honest:
 *
 * - The current revision pointer is not moved. A backfill can never change
 *   what a reader sees as the recipe.
 * - `occurredAt` has to be earlier than every revision already recorded.
 *   Anything else is a revise pretending to be a backfill, and is refused
 *   rather than silently accepted into the middle of the history.
 *
 * The revision still takes the next number. Numbers are identity here —
 * they are in URLs and in the keys that remember ticked ingredients — so
 * they say when something was recorded, and `occurred_at` says when it
 * happened. Renumbering to squeeze one in would change what every existing
 * number means.
 */
export async function backfillRevision(
  input: BackfillRevisionInput,
  source: 'human' | 'mcp' | 'import' = 'mcp',
): Promise<WriteResult> {
  return withTransaction(async (tx) => {
    const found = await tx
      .select({ id: recipes.id, title: recipes.title })
      .from(recipes)
      .where(eq(recipes.slug, input.slug))
      .limit(1);
    const recipe = found[0];
    if (!recipe) {
      throw new NotFoundError(`No recipe with slug "${input.slug}".`);
    }

    const occurredAt = new Date(input.occurredAt);

    // Compare against the earliest point in the history as it stands, using
    // the same COALESCE the read side orders by — otherwise two backfills
    // in a row would measure the second against a created_at from today.
    const boundary = await tx
      .select({
        earliest: sql<Date | null>`MIN(COALESCE(${recipeRevisions.occurredAt}, ${recipeRevisions.createdAt}))`,
        max: sql<number>`COALESCE(MAX(${recipeRevisions.revisionNumber}), 0)`,
      })
      .from(recipeRevisions)
      .where(eq(recipeRevisions.recipeId, recipe.id));

    const earliest = boundary[0]?.earliest
      ? new Date(boundary[0].earliest)
      : null;
    if (earliest && occurredAt >= earliest) {
      throw new ConflictError(
        `This recipe's earliest recorded version is ${earliest.toISOString()}, ` +
          `and ${occurredAt.toISOString()} is not before it. To add a version ` +
          'that comes after what is stored, use revise_recipe.',
      );
    }

    const revisionNumber = Number(boundary[0]?.max ?? 0) + 1;

    const revisionRow = await tx
      .insert(recipeRevisions)
      .values({
        recipeId: recipe.id,
        revisionNumber,
        title: input.title ?? recipe.title,
        summary: input.summary ?? null,
        rationale: input.rationale,
        yieldQuantity:
          input.yieldQuantity === undefined ? null : num(input.yieldQuantity),
        yieldUnit: input.yieldUnit ?? null,
        servings: input.servings ?? null,
        totalTimeMinutes: input.totalTimeMinutes ?? null,
        activeTimeMinutes: input.activeTimeMinutes ?? null,
        source,
        occurredAt,
      })
      .returning({ id: recipeRevisions.id });
    const revisionId = revisionRow[0]!.id;

    await writeRevisionBody(
      tx,
      revisionId,
      input.ingredients ?? [],
      input.steps ?? [],
    );
    await writeNotes(tx, { revisionId }, input.notes);

    // Deliberately no update to `recipes`: not the title, not the summary,
    // and above all not currentRevisionId. Everything a reader sees stays
    // exactly as it was. `updatedAt` does move, because the record of this
    // recipe did change and the sitemap should say so.
    await tx
      .update(recipes)
      .set({ updatedAt: new Date() })
      .where(eq(recipes.id, recipe.id));

    return {
      slug: input.slug,
      revisionNumber,
      recipeId: recipe.id,
      revisionId,
      unresolvedLinks: [],
      needsDescription: await collectNeedsDescription(
        tx,
        recipe.id,
        revisionId,
      ),
    };
  });
}

/** Read a revision's ingredient lines back out in submission shape. */
async function copyIngredientLines(
  tx: Tx,
  revisionId: string,
): Promise<IngredientLineInput[]> {
  const rows = await tx
    .select({
      name: sql<string>`COALESCE(${ingredients.name}, ${recipeIngredients.rawText})`,
      quantity: recipeIngredients.quantity,
      quantityMax: recipeIngredients.quantityMax,
      unit: recipeIngredients.unit,
      component: recipeIngredients.component,
      preparation: recipeIngredients.preparation,
      optional: recipeIngredients.optional,
      note: recipeIngredients.note,
      rawText: recipeIngredients.rawText,
    })
    .from(recipeIngredients)
    .leftJoin(ingredients, eq(ingredients.id, recipeIngredients.ingredientId))
    .where(eq(recipeIngredients.revisionId, revisionId))
    .orderBy(recipeIngredients.position);

  return rows.map((r) => ({
    name: r.name,
    quantity: r.quantity == null ? null : Number(r.quantity),
    quantityMax: r.quantityMax == null ? null : Number(r.quantityMax),
    unit: r.unit,
    component: r.component,
    preparation: r.preparation,
    optional: r.optional,
    note: r.note,
    rawText: r.rawText,
  }));
}

/** Read a revision's steps back out in submission shape. */
async function copySteps(tx: Tx, revisionId: string): Promise<StepInput[]> {
  const rows = await tx
    .select({
      id: recipeSteps.id,
      phase: recipeSteps.phase,
      instruction: recipeSteps.instruction,
      durationMinutes: recipeSteps.durationMinutes,
      durationMaxMinutes: recipeSteps.durationMaxMinutes,
      temperatureC: recipeSteps.temperatureC,
      equipment: recipeSteps.equipment,
      imageUrl: recipeSteps.imageUrl,
      imageAlt: recipeSteps.imageAlt,
      note: recipeSteps.note,
      technique: taxonomyTerms.label,
    })
    .from(recipeSteps)
    .leftJoin(taxonomyTerms, eq(taxonomyTerms.id, recipeSteps.techniqueTermId))
    .where(eq(recipeSteps.revisionId, revisionId))
    .orderBy(recipeSteps.position);

  if (rows.length === 0) return [];

  const usesRows = await tx
    .select({
      stepId: recipeStepIngredients.stepId,
      name: sql<string>`COALESCE(${ingredients.name}, ${recipeIngredients.rawText})`,
    })
    .from(recipeStepIngredients)
    .innerJoin(
      recipeIngredients,
      eq(recipeIngredients.id, recipeStepIngredients.recipeIngredientId),
    )
    .leftJoin(ingredients, eq(ingredients.id, recipeIngredients.ingredientId))
    .where(
      inArray(
        recipeStepIngredients.stepId,
        rows.map((r) => r.id),
      ),
    );

  const usesByStep = new Map<string, string[]>();
  for (const row of usesRows) {
    const list = usesByStep.get(row.stepId) ?? [];
    list.push(row.name);
    usesByStep.set(row.stepId, list);
  }

  return rows.map((r) => ({
    instruction: r.instruction,
    phase: r.phase,
    durationMinutes: r.durationMinutes,
    durationMaxMinutes: r.durationMaxMinutes,
    temperatureC: r.temperatureC == null ? null : Number(r.temperatureC),
    equipment: r.equipment,
    technique: r.technique,
    uses: usesByStep.get(r.id) ?? [],
    imageUrl: r.imageUrl,
    imageAlt: r.imageAlt,
    note: r.note,
  }));
}

// ─────────────────────────────────────────────────────────────────────────
// Notes, ingredients, experiments
// ─────────────────────────────────────────────────────────────────────────

export async function addNote(
  input: AddNoteInput,
): Promise<{ noteId: string }> {
  return withTransaction(async (tx) => {
    const subject: Parameters<typeof writeNotes>[1] = {};

    if (input.recipeSlug) {
      const found = await tx
        .select({
          id: recipes.id,
          currentRevisionId: recipes.currentRevisionId,
        })
        .from(recipes)
        .where(eq(recipes.slug, input.recipeSlug))
        .limit(1);
      if (!found[0])
        throw new NotFoundError(`No recipe "${input.recipeSlug}".`);

      if (input.revisionNumber != null) {
        const rev = await tx
          .select({ id: recipeRevisions.id })
          .from(recipeRevisions)
          .where(
            and(
              eq(recipeRevisions.recipeId, found[0].id),
              eq(recipeRevisions.revisionNumber, input.revisionNumber),
            ),
          )
          .limit(1);
        if (!rev[0]) {
          throw new NotFoundError(
            `Recipe "${input.recipeSlug}" has no revision ${input.revisionNumber}.`,
          );
        }
        subject.revisionId = rev[0].id;
      } else {
        subject.recipeId = found[0].id;
      }
    } else if (input.ingredientSlug) {
      const found = await tx
        .select({ id: ingredients.id })
        .from(ingredients)
        .where(eq(ingredients.slug, input.ingredientSlug))
        .limit(1);
      if (!found[0]) {
        throw new NotFoundError(`No ingredient "${input.ingredientSlug}".`);
      }
      subject.ingredientId = found[0].id;
    } else if (input.experimentSlug) {
      const found = await tx
        .select({ id: experiments.id })
        .from(experiments)
        .where(eq(experiments.slug, input.experimentSlug))
        .limit(1);
      if (!found[0]) {
        throw new NotFoundError(`No experiment "${input.experimentSlug}".`);
      }
      subject.experimentId = found[0].id;
    }

    const [noteId] = await writeNotes(tx, subject, [
      {
        kind: input.kind,
        title: input.title,
        body: input.body,
        sources: input.sources,
      },
    ]);

    return { noteId: noteId! };
  });
}

/**
 * Give a taxonomy term its display label, blurb and place in the hierarchy.
 *
 * Creates the term when it does not exist, so this is also how a term is
 * authored ahead of any recipe using it. `description` and `parentSlug` are
 * only written when supplied — passing just a label will not blank out a
 * blurb that is already there. Pass an explicit `null` to clear one.
 */
export async function upsertCategory(
  input: UpsertCategoryInput,
): Promise<{ categoryType: CategoryType; slug: string; created: boolean }> {
  return withTransaction(async (tx) => {
    const slug = input.slug ? slugify(input.slug) : slugify(input.label);
    if (!slug) throw new Error('Term label does not produce a usable slug.');

    let parentId: string | null | undefined;
    if (input.parentSlug !== undefined) {
      if (input.parentSlug === null) {
        parentId = null;
      } else {
        const parentSlug = slugify(input.parentSlug);
        if (parentSlug === slug) {
          throw new Error('A term cannot be its own parent.');
        }
        // Scoped to the same facet on purpose: a cuisine parented to a
        // technique would make the hierarchy meaningless, and silently
        // dropping it would hide the mistake.
        const parent = await tx
          .select({ id: taxonomyTerms.id })
          .from(taxonomyTerms)
          .where(
            and(
              eq(taxonomyTerms.facet, input.categoryType),
              eq(taxonomyTerms.slug, parentSlug),
            ),
          )
          .limit(1);
        if (!parent[0]) {
          throw new Error(
            `No tag "${parentSlug}" in the "${input.categoryType}" category to use as parent.`,
          );
        }
        parentId = parent[0].id;
      }
    }

    const existing = await tx
      .select({ id: taxonomyTerms.id })
      .from(taxonomyTerms)
      .where(
        and(
          eq(taxonomyTerms.facet, input.categoryType),
          eq(taxonomyTerms.slug, slug),
        ),
      )
      .limit(1);

    if (existing[0]) {
      await tx
        .update(taxonomyTerms)
        .set({
          label: input.label,
          ...(input.description !== undefined
            ? { description: input.description ?? null }
            : {}),
          ...(parentId !== undefined ? { parentId } : {}),
          updatedAt: new Date(),
        })
        .where(eq(taxonomyTerms.id, existing[0].id));
      return { categoryType: input.categoryType, slug, created: false };
    }

    await tx.insert(taxonomyTerms).values({
      facet: input.categoryType,
      slug,
      label: input.label,
      description: input.description ?? null,
      parentId: parentId ?? null,
    });
    return { categoryType: input.categoryType, slug, created: true };
  });
}

export async function upsertIngredient(
  input: UpsertIngredientInput,
): Promise<{ slug: string; created: boolean }> {
  return withTransaction(async (tx) => {
    const slug = input.slug ?? slugify(input.name);
    const existing = await tx
      .select({ id: ingredients.id })
      .from(ingredients)
      .where(eq(ingredients.slug, slug))
      .limit(1);

    // An alias that already resolves elsewhere must not be taken quietly.
    //
    // `coriander-seed` held the bare alias "coriander", so every future
    // line naming coriander for a herb bound to the seed record — silently,
    // with no error and nothing in the result to notice. Silent binding is
    // the failure mode: a wrong ingredient is worse than a rejected write,
    // because the write can be retried and the wrong binding cannot be
    // seen. The error names what it collided with so the caller can either
    // pick a narrower alias or accept the existing ingredient.
    for (const alias of input.aliases ?? []) {
      const trimmed = alias.trim();
      if (!trimmed) continue;
      const ownerId = await findIngredientId(tx, trimmed);
      if (!ownerId || ownerId === existing[0]?.id) continue;
      const owner = await tx
        .select({ slug: ingredients.slug, name: ingredients.name })
        .from(ingredients)
        .where(eq(ingredients.id, ownerId))
        .limit(1);
      throw new ConflictError(
        `The alias "${trimmed}" already resolves to "${owner[0]?.name}" ` +
          `(${owner[0]?.slug}). Two ingredients cannot answer to the same ` +
          'name: a recipe line naming it would bind to one of them without ' +
          'saying which. Either narrow this alias, or add it to ' +
          `${owner[0]?.slug} if they really are the same ingredient.`,
      );
    }

    const values = {
      slug,
      name: input.name,
      plural: input.plural ?? null,
      category: input.category ?? 'other',
      description: input.description ?? null,
      densityGPerMl: num(input.densityGPerMl),
      defaultUnit: normaliseUnit(input.defaultUnit),
      aliases: input.aliases ?? [],
      updatedAt: new Date(),
    };

    const row = existing[0]
      ? await tx
          .update(ingredients)
          .set(values)
          .where(eq(ingredients.id, existing[0].id))
          .returning({ id: ingredients.id })
      : await tx
          .insert(ingredients)
          .values(values)
          .returning({ id: ingredients.id });

    const ingredientId = row[0]!.id;

    for (const substitute of input.substitutes ?? []) {
      const otherId = await resolveIngredientId(tx, substitute);
      if (otherId === ingredientId) continue;
      // Substitution is symmetric in practice — if espelette stands in for
      // cayenne, the reverse is worth knowing too.
      for (const [from, to] of [
        [ingredientId, otherId],
        [otherId, ingredientId],
      ] as const) {
        await tx
          .insert(ingredientRelations)
          .values({
            fromIngredientId: from,
            toIngredientId: to,
            kind: 'substitute',
          })
          .onConflictDoNothing();
      }
    }

    return { slug, created: !existing[0] };
  });
}

export async function logExperiment(
  input: LogExperimentInput,
): Promise<{ slug: string; itemCount: number; observationCount: number }> {
  return withTransaction(async (tx) => {
    const taken = await tx.select({ slug: experiments.slug }).from(experiments);
    const slug =
      input.slug ??
      uniqueSlug(
        input.title,
        taken.map((e) => e.slug),
      );

    let recipeId: string | null = null;
    let revisionId: string | null = null;
    if (input.recipeSlug) {
      const found = await tx
        .select({
          id: recipes.id,
          currentRevisionId: recipes.currentRevisionId,
        })
        .from(recipes)
        .where(eq(recipes.slug, input.recipeSlug))
        .limit(1);
      if (!found[0])
        throw new NotFoundError(`No recipe "${input.recipeSlug}".`);
      recipeId = found[0].id;
      revisionId = found[0].currentRevisionId;

      if (input.revisionNumber != null) {
        const rev = await tx
          .select({ id: recipeRevisions.id })
          .from(recipeRevisions)
          .where(
            and(
              eq(recipeRevisions.recipeId, recipeId),
              eq(recipeRevisions.revisionNumber, input.revisionNumber),
            ),
          )
          .limit(1);
        if (!rev[0]) {
          throw new NotFoundError(
            `Recipe "${input.recipeSlug}" has no revision ${input.revisionNumber}.`,
          );
        }
        revisionId = rev[0].id;
      }
    }

    const values = {
      slug,
      recipeId,
      revisionId,
      title: input.title,
      summary: input.summary ?? null,
      startedAt: input.startedAt ?? null,
      completedAt: input.completedAt ?? null,
      scaleFactor: num(input.scaleFactor),
      outcome: input.outcome ?? null,
      costTotal: num(input.costTotal),
      currency: input.currency ?? 'EUR',
      updatedAt: new Date(),
    };

    const existing = await tx
      .select({ id: experiments.id })
      .from(experiments)
      .where(eq(experiments.slug, slug))
      .limit(1);

    const row = existing[0]
      ? await tx
          .update(experiments)
          .set(values)
          .where(eq(experiments.id, existing[0].id))
          .returning({ id: experiments.id })
      : await tx
          .insert(experiments)
          .values(values)
          .returning({ id: experiments.id });
    const experimentId = row[0]!.id;

    // Re-logging an experiment replaces its measurements rather than
    // appending duplicates — the labels ("A1", "piece 3") are stable
    // identities within a run, not a time series.
    await tx
      .delete(experimentObservations)
      .where(eq(experimentObservations.experimentId, experimentId));
    await tx
      .delete(experimentItems)
      .where(eq(experimentItems.experimentId, experimentId));

    const itemIdByLabel = new Map<string, string>();
    for (const [index, item] of (input.items ?? []).entries()) {
      const inserted = await tx
        .insert(experimentItems)
        .values({
          experimentId,
          label: item.label,
          position: index,
          note: item.note ?? null,
        })
        .returning({ id: experimentItems.id });
      itemIdByLabel.set(item.label, inserted[0]!.id);
    }

    let observationCount = 0;
    for (const observation of input.observations ?? []) {
      let itemId: string | null = null;
      if (observation.item) {
        itemId = itemIdByLabel.get(observation.item) ?? null;
        if (!itemId) {
          // An observation may name an item that was not declared up front;
          // create it rather than dropping the measurement.
          const inserted = await tx
            .insert(experimentItems)
            .values({
              experimentId,
              label: observation.item,
              position: itemIdByLabel.size,
            })
            .returning({ id: experimentItems.id });
          itemId = inserted[0]!.id;
          itemIdByLabel.set(observation.item, itemId);
        }
      }
      await tx.insert(experimentObservations).values({
        experimentId,
        itemId,
        recordedAt: observation.recordedAt ?? null,
        metric: observation.metric,
        value: num(observation.value),
        unit: normaliseUnit(observation.unit),
        note: observation.note ?? null,
      });
      observationCount += 1;
    }

    await writeNotes(tx, { experimentId }, input.notes);

    return { slug, itemCount: itemIdByLabel.size, observationCount };
  });
}
