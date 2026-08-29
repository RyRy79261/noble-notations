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
import { formatIngredientLine, normaliseUnit } from '@/lib/domain/units';
import type {
  AddNoteInput,
  CreateRecipeInput,
  IngredientLineInput,
  LogExperimentInput,
  NoteInput,
  ReviseRecipeInput,
  StepInput,
  TaxonomyFacet,
  TaxonomyInput,
  UpsertIngredientInput,
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
async function resolveIngredientId(tx: Tx, name: string): Promise<string> {
  const trimmed = name.trim();
  const slug = slugify(trimmed);

  const bySlug = await tx
    .select({ id: ingredients.id })
    .from(ingredients)
    .where(eq(ingredients.slug, slug))
    .limit(1);
  if (bySlug[0]) return bySlug[0].id;

  const byNameOrAlias = await tx
    .select({ id: ingredients.id })
    .from(ingredients)
    .where(
      sql`lower(${ingredients.name}) = ${trimmed.toLowerCase()}
          OR EXISTS (
            SELECT 1 FROM unnest(${ingredients.aliases}) AS a
             WHERE lower(a) = ${trimmed.toLowerCase()}
          )`,
    )
    .limit(1);
  if (byNameOrAlias[0]) return byNameOrAlias[0].id;

  const inserted = await tx
    .insert(ingredients)
    .values({ slug, name: trimmed })
    // A concurrent write may have created the same slug between the select
    // and here; take whatever is there rather than failing the whole recipe.
    .onConflictDoUpdate({
      target: ingredients.slug,
      set: { updatedAt: new Date() },
    })
    .returning({ id: ingredients.id });
  return inserted[0]!.id;
}

/** Find (or create) a taxonomy term within a facet. */
async function resolveTermId(
  tx: Tx,
  facet: TaxonomyFacet,
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
  taxonomy: TaxonomyInput,
): Promise<void> {
  if (!taxonomy) return;
  await tx.delete(recipeTerms).where(eq(recipeTerms.recipeId, recipeId));

  for (const [facet, labels] of Object.entries(taxonomy)) {
    if (!labels?.length) continue;
    for (const [index, label] of labels.entries()) {
      const termId = await resolveTermId(tx, facet as TaxonomyFacet, label);
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
  /** Ingredient-line id keyed by the lowercased name a step would reference. */
  const lineIdByName = new Map<string, string>();

  for (const [index, line] of ingredientLines.entries()) {
    const ingredientId = await resolveIngredientId(tx, line.name);
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

    lineIdByName.set(line.name.trim().toLowerCase(), inserted[0]!.id);
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
  await tx.delete(recipeLinks).where(eq(recipeLinks.fromRecipeId, fromRecipeId));

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
    const slug = input.slug ?? uniqueSlug(desired, taken.map((r) => r.slug));

    const recipeRow = await tx
      .insert(recipes)
      .values({
        slug,
        title: input.title,
        subtitle: input.subtitle ?? null,
        summary: input.summary ?? null,
        kind: input.kind ?? 'recipe',
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
    await applyTaxonomy(tx, recipeId, input.taxonomy);
    await writeNotes(tx, { recipeId }, input.notes);
    const unresolvedLinks = await applyLinks(tx, recipeId, input.links);

    // Set last: the search-vector trigger fires on current_revision_id and
    // needs the ingredient rows to already be there.
    await tx
      .update(recipes)
      .set({ currentRevisionId: revisionId, updatedAt: new Date() })
      .where(eq(recipes.id, recipeId));

    return { slug, revisionNumber: 1, recipeId, revisionId, unresolvedLinks };
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
      .select({ max: sql<number>`COALESCE(MAX(${recipeRevisions.revisionNumber}), 0)` })
      .from(recipeRevisions)
      .where(eq(recipeRevisions.recipeId, recipe.id));
    const revisionNumber = Number(maxRow[0]?.max ?? 0) + 1;

    /** Omitted fields carry forward from the revision being superseded. */
    const carry = <T>(next: T | null | undefined, prev: T | null | undefined) =>
      next === undefined ? (prev ?? null) : (next ?? null);

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
          input.yieldQuantity === undefined ? undefined : num(input.yieldQuantity),
          previous?.yieldQuantity,
        ),
        yieldUnit: carry(input.yieldUnit, previous?.yieldUnit),
        servings: carry(input.servings, previous?.servings),
        totalTimeMinutes: carry(input.totalTimeMinutes, previous?.totalTimeMinutes),
        activeTimeMinutes: carry(input.activeTimeMinutes, previous?.activeTimeMinutes),
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
      const known = new Set(ingredientLines.map((l) => l.name.trim().toLowerCase()));
      for (const [i, step] of stepList.entries()) {
        for (const used of step.uses ?? []) {
          if (!known.has(used.trim().toLowerCase())) {
            throw new ConflictError(
              `Step ${i + 1} uses "${used}", which is not in this recipe's ` +
                'ingredient list. Send `ingredients` alongside `steps` to change both.',
            );
          }
        }
      }
    }

    await writeRevisionBody(tx, revisionId, ingredientLines, stepList);
    await applyTaxonomy(tx, recipe.id, input.taxonomy);
    await writeNotes(tx, { revisionId }, input.notes);
    const unresolvedLinks = input.links
      ? await applyLinks(tx, recipe.id, input.links)
      : [];

    await tx
      .update(recipes)
      .set({
        title,
        ...(input.subtitle !== undefined ? { subtitle: input.subtitle ?? null } : {}),
        ...(input.summary !== undefined ? { summary: input.summary ?? null } : {}),
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
    note: r.note,
  }));
}

// ─────────────────────────────────────────────────────────────────────────
// Notes, ingredients, experiments
// ─────────────────────────────────────────────────────────────────────────

export async function addNote(input: AddNoteInput): Promise<{ noteId: string }> {
  return withTransaction(async (tx) => {
    const subject: Parameters<typeof writeNotes>[1] = {};

    if (input.recipeSlug) {
      const found = await tx
        .select({ id: recipes.id, currentRevisionId: recipes.currentRevisionId })
        .from(recipes)
        .where(eq(recipes.slug, input.recipeSlug))
        .limit(1);
      if (!found[0]) throw new NotFoundError(`No recipe "${input.recipeSlug}".`);

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
      : await tx.insert(ingredients).values(values).returning({ id: ingredients.id });

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
          .values({ fromIngredientId: from, toIngredientId: to, kind: 'substitute' })
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
    const slug = input.slug ?? uniqueSlug(input.title, taken.map((e) => e.slug));

    let recipeId: string | null = null;
    let revisionId: string | null = null;
    if (input.recipeSlug) {
      const found = await tx
        .select({ id: recipes.id, currentRevisionId: recipes.currentRevisionId })
        .from(recipes)
        .where(eq(recipes.slug, input.recipeSlug))
        .limit(1);
      if (!found[0]) throw new NotFoundError(`No recipe "${input.recipeSlug}".`);
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
      : await tx.insert(experiments).values(values).returning({ id: experiments.id });
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
