import 'server-only';

/**
 * ─────────────────────────────────────────────────────────────────────────
 * THE BIN. THIS IS THE ONE READ MODULE THAT DOES NOT FILTER DELETED ROWS.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Every query here says `deleted_at IS NOT NULL` — the exact opposite of the
 * rest of the read path — because showing deleted records is its whole job.
 *
 * **DO NOT COPY A QUERY OUT OF THIS FILE.** It selects from the base tables,
 * and a base table holds rows that somebody deleted on purpose. `read.ts` is
 * where a query that feeds a page or a read tool belongs, and
 * `eslint.config.mjs` stops that file naming a base table at all. This module
 * is deliberately the only exception, and it is one file with one exported
 * function so that the exception can be read in full in under a minute.
 *
 * It exists to answer one question — *what is in the bin?* — for the
 * `list_deleted` tool. Nothing on the website imports it. Nothing on the
 * website should: a record in here is a record the site is meant not to show.
 *
 * Three facts make a row in the bin useful, and each costs a lookup the naive
 * listing does not do:
 *
 * - **the handle**, one line a person recognises, which for a revision means
 *   reading its recipe's title;
 * - **`withParent`**, which says this row went with something else rather
 *   than being deleted on its own — it is the same `deleted_event_id`;
 * - **`restoreBlockedBy`**, which is the restore rule from `write.ts` asked
 *   in advance, so the caller is told which row to restore first instead of
 *   finding out from a refusal.
 *
 * `restoreBlockedBy` states the same rule `restoreBlockedBy()` in `write.ts`
 * enforces: **a restore is refused when the record the row belongs to is
 * still deleted.** Change one of these and change the other. They encode one
 * rule, and this one is the advisory copy — the write layer is the authority.
 */
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  experiments,
  ingredients,
  notes,
  recipeRevisions,
  recipeSteps,
  recipes,
  taxonomyTerms,
} from '@/db/schema';
import {
  DELETABLE_KINDS,
  type CategoryType,
  type DeletableKind,
} from '@/lib/domain/schemas';

/**
 * One record, written the way `restore_record` takes it.
 *
 * **Either a `slug` or an `id`, never both.** `checkRecordAddress` in
 * `schemas.ts` refuses an address that carries the two — an id is the whole
 * address, and a qualifier beside it either says nothing or disagrees with
 * the row — so a listing that helpfully included both would hand back
 * arguments the restore rejects. This prefers the slug, which is the form a
 * person reads, and falls back to the id for a note, which has no slug.
 */
export interface RestoreAddress {
  kind: DeletableKind;
  id?: string;
  slug?: string;
  revisionNumber?: number;
  categoryType?: CategoryType;
}

export interface DeletedRecordView {
  kind: DeletableKind;
  id: string;
  /** Ready to send to `restore_record`, unchanged. */
  address: RestoreAddress;
  /** One line a person recognises. */
  handle: string;
  deletedAt: string;
  deletedBy: string | null;
  reason: string | null;
  /** Set when this row went with something else — the same delete event. */
  withParent: { kind: DeletableKind; handle: string } | null;
  /** The record to restore first, when one must be. */
  restoreBlockedBy: {
    kind: DeletableKind;
    handle: string;
    address: RestoreAddress;
  } | null;
}

/* ── The six selects ───────────────────────────────────────────────────── */

/**
 * A row as it comes out of one of the six tables, before the parent lookups.
 *
 * `parents` is the candidate chain in the order `write.ts` walks it: the
 * FIRST deleted one blocks the restore. A recipe, an ingredient and a tag
 * stand on their own and carry an empty chain.
 */
interface RawDeleted {
  kind: DeletableKind;
  id: string;
  address: RestoreAddress;
  handle: string;
  deletedAt: Date;
  deletedBy: string | null;
  reason: string | null;
  eventId: string | null;
  parents: { kind: DeletableKind; id: string }[];
}

/** A note's handle: its kind, then its title or the start of its body. */
function noteHandle(kind: string, title: string | null, body: string): string {
  const text = title?.trim() || body.trim().replace(/\s+/g, ' ').slice(0, 80);
  return `${kind}: ${text}`;
}

/**
 * How many rows each kind has to fetch.
 *
 * Six lists are merged in JS and then sliced, so each one has to reach as far
 * as the last row the caller could see. `offset + limit` is exactly that: if
 * every row on the page came from one table, this is the whole page.
 */
function reach(offset: number, limit: number): number {
  return offset + limit;
}

async function deletedRecipes(take: number): Promise<{
  rows: RawDeleted[];
  total: number;
}> {
  const found = await db
    .select({
      id: recipes.id,
      slug: recipes.slug,
      title: recipes.title,
      deletedAt: recipes.deletedAt,
      deletedBy: recipes.deletedBy,
      reason: recipes.deletedReason,
      eventId: recipes.deletedEventId,
      total: sql<string>`COUNT(*) OVER ()`,
    })
    .from(recipes)
    .where(isNotNull(recipes.deletedAt))
    .orderBy(desc(recipes.deletedAt), desc(recipes.id))
    .limit(take);

  return {
    total: found.length > 0 ? Number(found[0]!.total) : 0,
    rows: found.map((row) => ({
      kind: 'recipe' as const,
      id: row.id,
      address: { kind: 'recipe' as const, slug: row.slug },
      handle: `${row.title} (${row.slug})`,
      deletedAt: row.deletedAt!,
      deletedBy: row.deletedBy,
      reason: row.reason,
      eventId: row.eventId,
      parents: [],
    })),
  };
}

async function deletedRevisions(take: number): Promise<{
  rows: RawDeleted[];
  total: number;
}> {
  // The recipe joins from the BASE table on purpose: a cascaded revision's
  // recipe is deleted too, and a handle that read "undefined, revision 3"
  // would be the one line the bin exists to print.
  const found = await db
    .select({
      id: recipeRevisions.id,
      revisionNumber: recipeRevisions.revisionNumber,
      recipeId: recipeRevisions.recipeId,
      recipeSlug: recipes.slug,
      recipeTitle: recipes.title,
      deletedAt: recipeRevisions.deletedAt,
      deletedBy: recipeRevisions.deletedBy,
      reason: recipeRevisions.deletedReason,
      eventId: recipeRevisions.deletedEventId,
      total: sql<string>`COUNT(*) OVER ()`,
    })
    .from(recipeRevisions)
    .innerJoin(recipes, eq(recipes.id, recipeRevisions.recipeId))
    .where(isNotNull(recipeRevisions.deletedAt))
    .orderBy(desc(recipeRevisions.deletedAt), desc(recipeRevisions.id))
    .limit(take);

  return {
    total: found.length > 0 ? Number(found[0]!.total) : 0,
    rows: found.map((row) => ({
      kind: 'revision' as const,
      id: row.id,
      address: {
        kind: 'revision' as const,
        slug: row.recipeSlug,
        revisionNumber: row.revisionNumber,
      },
      handle: `${row.recipeTitle}, revision ${row.revisionNumber}`,
      deletedAt: row.deletedAt!,
      deletedBy: row.deletedBy,
      reason: row.reason,
      eventId: row.eventId,
      parents: [{ kind: 'recipe' as const, id: row.recipeId }],
    })),
  };
}

async function deletedNotes(take: number): Promise<{
  rows: RawDeleted[];
  total: number;
}> {
  const found = await db
    .select({
      id: notes.id,
      kind: notes.kind,
      title: notes.title,
      body: notes.body,
      recipeId: notes.recipeId,
      revisionId: notes.revisionId,
      stepId: notes.stepId,
      ingredientId: notes.ingredientId,
      experimentId: notes.experimentId,
      deletedAt: notes.deletedAt,
      deletedBy: notes.deletedBy,
      reason: notes.deletedReason,
      eventId: notes.deletedEventId,
      total: sql<string>`COUNT(*) OVER ()`,
    })
    .from(notes)
    .where(isNotNull(notes.deletedAt))
    .orderBy(desc(notes.deletedAt), desc(notes.id))
    .limit(take);

  // A step carries no delete flag of its own — its lifetime is its
  // revision's — so the record a step note belongs to is the step's revision.
  // Same one extra hop `write.ts` makes.
  const stepIds = [
    ...new Set(found.map((row) => row.stepId).filter((id) => id !== null)),
  ];
  const stepRevision = new Map<string, string>();
  if (stepIds.length > 0) {
    const steps = await db
      .select({ id: recipeSteps.id, revisionId: recipeSteps.revisionId })
      .from(recipeSteps)
      .where(inArray(recipeSteps.id, stepIds));
    for (const step of steps) stepRevision.set(step.id, step.revisionId);
  }

  return {
    total: found.length > 0 ? Number(found[0]!.total) : 0,
    rows: found.map((row) => {
      const stepParent = row.stepId ? stepRevision.get(row.stepId) : undefined;
      // The same order `restoreBlockedBy` walks in `write.ts`. A note has one
      // subject — `note_has_exactly_one_subject` — so at most one of these is
      // set and the order is a formality, stated anyway so the two agree.
      const parents = stepParent
        ? [{ kind: 'revision' as const, id: stepParent }]
        : (
            [
              ['recipe', row.recipeId],
              ['revision', row.revisionId],
              ['ingredient', row.ingredientId],
              ['experiment', row.experimentId],
            ] as const
          )
            .filter(([, id]) => id !== null)
            .map(([kind, id]) => ({ kind, id: id! }));

      return {
        kind: 'note' as const,
        id: row.id,
        // A note has no slug, so the id IS the address. It is the one kind
        // that has to use it.
        address: { kind: 'note' as const, id: row.id },
        handle: noteHandle(row.kind, row.title, row.body),
        deletedAt: row.deletedAt!,
        deletedBy: row.deletedBy,
        reason: row.reason,
        eventId: row.eventId,
        parents,
      };
    }),
  };
}

async function deletedExperiments(take: number): Promise<{
  rows: RawDeleted[];
  total: number;
}> {
  const found = await db
    .select({
      id: experiments.id,
      slug: experiments.slug,
      title: experiments.title,
      recipeId: experiments.recipeId,
      revisionId: experiments.revisionId,
      deletedAt: experiments.deletedAt,
      deletedBy: experiments.deletedBy,
      reason: experiments.deletedReason,
      eventId: experiments.deletedEventId,
      total: sql<string>`COUNT(*) OVER ()`,
    })
    .from(experiments)
    .where(isNotNull(experiments.deletedAt))
    .orderBy(desc(experiments.deletedAt), desc(experiments.id))
    .limit(take);

  return {
    total: found.length > 0 ? Number(found[0]!.total) : 0,
    rows: found.map((row) => ({
      kind: 'experiment' as const,
      id: row.id,
      address: { kind: 'experiment' as const, slug: row.slug },
      handle: `${row.title} (${row.slug})`,
      deletedAt: row.deletedAt!,
      deletedBy: row.deletedBy,
      reason: row.reason,
      eventId: row.eventId,
      // Both links are optional: a run may name no recipe at all (K-01).
      parents: (
        [
          ['recipe', row.recipeId],
          ['revision', row.revisionId],
        ] as const
      )
        .filter(([, id]) => id !== null)
        .map(([kind, id]) => ({ kind, id: id! })),
    })),
  };
}

async function deletedIngredients(take: number): Promise<{
  rows: RawDeleted[];
  total: number;
}> {
  const found = await db
    .select({
      id: ingredients.id,
      slug: ingredients.slug,
      name: ingredients.name,
      deletedAt: ingredients.deletedAt,
      deletedBy: ingredients.deletedBy,
      reason: ingredients.deletedReason,
      eventId: ingredients.deletedEventId,
      total: sql<string>`COUNT(*) OVER ()`,
    })
    .from(ingredients)
    .where(isNotNull(ingredients.deletedAt))
    .orderBy(desc(ingredients.deletedAt), desc(ingredients.id))
    .limit(take);

  return {
    total: found.length > 0 ? Number(found[0]!.total) : 0,
    rows: found.map((row) => ({
      kind: 'ingredient' as const,
      id: row.id,
      address: { kind: 'ingredient' as const, slug: row.slug },
      handle: `${row.name} (${row.slug})`,
      deletedAt: row.deletedAt!,
      deletedBy: row.deletedBy,
      reason: row.reason,
      eventId: row.eventId,
      parents: [],
    })),
  };
}

async function deletedTags(take: number): Promise<{
  rows: RawDeleted[];
  total: number;
}> {
  const found = await db
    .select({
      id: taxonomyTerms.id,
      facet: taxonomyTerms.facet,
      slug: taxonomyTerms.slug,
      label: taxonomyTerms.label,
      deletedAt: taxonomyTerms.deletedAt,
      deletedBy: taxonomyTerms.deletedBy,
      reason: taxonomyTerms.deletedReason,
      eventId: taxonomyTerms.deletedEventId,
      total: sql<string>`COUNT(*) OVER ()`,
    })
    .from(taxonomyTerms)
    .where(isNotNull(taxonomyTerms.deletedAt))
    .orderBy(desc(taxonomyTerms.deletedAt), desc(taxonomyTerms.id))
    .limit(take);

  return {
    total: found.length > 0 ? Number(found[0]!.total) : 0,
    rows: found.map((row) => ({
      kind: 'tag' as const,
      id: row.id,
      address: {
        kind: 'tag' as const,
        slug: row.slug,
        categoryType: row.facet as CategoryType,
      },
      // A tag slug is only unique inside its category type, so the handle
      // states the pair: `technique/braising — Braising`.
      handle: `${row.facet}/${row.slug} — ${row.label}`,
      deletedAt: row.deletedAt!,
      deletedBy: row.deletedBy,
      reason: row.reason,
      eventId: row.eventId,
      parents: [],
    })),
  };
}

/* ── The parent lookups ────────────────────────────────────────────────── */

/** What a parent row has to say for itself, whether it is live or not. */
interface ParentState {
  kind: DeletableKind;
  handle: string;
  address: RestoreAddress;
  deleted: boolean;
  eventId: string | null;
}

/**
 * Load the parents the listed rows named, deleted or not.
 *
 * Four kinds can be a parent — recipe, revision, ingredient, experiment — and
 * a tag and a note never are. Each is one statement over the ids the page
 * actually asked about, not a join per row.
 */
async function loadParents(
  wanted: { kind: DeletableKind; id: string }[],
): Promise<Map<string, ParentState>> {
  const out = new Map<string, ParentState>();
  const idsOf = (kind: DeletableKind) => [
    ...new Set(wanted.filter((w) => w.kind === kind).map((w) => w.id)),
  ];
  const key = (kind: DeletableKind, id: string) => `${kind}:${id}`;

  const recipeIds = idsOf('recipe');
  const revisionIds = idsOf('revision');
  const ingredientIds = idsOf('ingredient');
  const experimentIds = idsOf('experiment');

  const [recipeRows, revisionRows, ingredientRows, experimentRows] =
    await Promise.all([
      recipeIds.length
        ? db
            .select({
              id: recipes.id,
              slug: recipes.slug,
              title: recipes.title,
              deletedAt: recipes.deletedAt,
              eventId: recipes.deletedEventId,
            })
            .from(recipes)
            .where(inArray(recipes.id, recipeIds))
        : [],
      revisionIds.length
        ? db
            .select({
              id: recipeRevisions.id,
              revisionNumber: recipeRevisions.revisionNumber,
              recipeSlug: recipes.slug,
              recipeTitle: recipes.title,
              deletedAt: recipeRevisions.deletedAt,
              eventId: recipeRevisions.deletedEventId,
            })
            .from(recipeRevisions)
            .innerJoin(recipes, eq(recipes.id, recipeRevisions.recipeId))
            .where(inArray(recipeRevisions.id, revisionIds))
        : [],
      ingredientIds.length
        ? db
            .select({
              id: ingredients.id,
              slug: ingredients.slug,
              name: ingredients.name,
              deletedAt: ingredients.deletedAt,
              eventId: ingredients.deletedEventId,
            })
            .from(ingredients)
            .where(inArray(ingredients.id, ingredientIds))
        : [],
      experimentIds.length
        ? db
            .select({
              id: experiments.id,
              slug: experiments.slug,
              title: experiments.title,
              deletedAt: experiments.deletedAt,
              eventId: experiments.deletedEventId,
            })
            .from(experiments)
            .where(inArray(experiments.id, experimentIds))
        : [],
    ]);

  for (const row of recipeRows) {
    out.set(key('recipe', row.id), {
      kind: 'recipe',
      handle: `${row.title} (${row.slug})`,
      address: { kind: 'recipe', slug: row.slug },
      deleted: row.deletedAt !== null,
      eventId: row.eventId,
    });
  }
  for (const row of revisionRows) {
    out.set(key('revision', row.id), {
      kind: 'revision',
      handle: `${row.recipeTitle}, revision ${row.revisionNumber}`,
      address: {
        kind: 'revision',
        slug: row.recipeSlug,
        revisionNumber: row.revisionNumber,
      },
      deleted: row.deletedAt !== null,
      eventId: row.eventId,
    });
  }
  for (const row of ingredientRows) {
    out.set(key('ingredient', row.id), {
      kind: 'ingredient',
      handle: `${row.name} (${row.slug})`,
      address: { kind: 'ingredient', slug: row.slug },
      deleted: row.deletedAt !== null,
      eventId: row.eventId,
    });
  }
  for (const row of experimentRows) {
    out.set(key('experiment', row.id), {
      kind: 'experiment',
      handle: `${row.title} (${row.slug})`,
      address: { kind: 'experiment', slug: row.slug },
      deleted: row.deletedAt !== null,
      eventId: row.eventId,
    });
  }
  return out;
}

/* ── The listing ───────────────────────────────────────────────────────── */

const FETCHERS: Record<
  DeletableKind,
  (take: number) => Promise<{ rows: RawDeleted[]; total: number }>
> = {
  recipe: deletedRecipes,
  revision: deletedRevisions,
  note: deletedNotes,
  experiment: deletedExperiments,
  ingredient: deletedIngredients,
  tag: deletedTags,
};

/**
 * What is in the bin.
 *
 * Six selects in parallel — one when `kind` is given — merged in JS, sorted
 * `deletedAt DESC, kind, id`, then sliced. THIS IS DELIBERATE AND IT IS RIGHT
 * AT THIS SCALE: the bin holds what one administrator deleted, the six tables
 * are small, and each select is a partial-index scan bounded by
 * `offset + limit`. A `UNION ALL` over six different row shapes would push
 * the merge into SQL, need a common column list nobody wants to maintain, and
 * still have to go back for the handles and the parents. Do not turn it into
 * one without a measurement that says why.
 */
export async function listDeleted(options?: {
  kind?: DeletableKind;
  limit?: number;
  offset?: number;
}): Promise<{ rows: DeletedRecordView[]; total: number }> {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  const kinds = options?.kind ? [options.kind] : [...DELETABLE_KINDS];
  const take = reach(offset, limit);

  const results = await Promise.all(kinds.map((kind) => FETCHERS[kind](take)));

  const total = results.reduce((sum, result) => sum + result.total, 0);
  const merged = results
    .flatMap((result) => result.rows)
    .sort(
      (a, b) =>
        b.deletedAt.getTime() - a.deletedAt.getTime() ||
        DELETABLE_KINDS.indexOf(a.kind) - DELETABLE_KINDS.indexOf(b.kind) ||
        a.id.localeCompare(b.id),
    )
    .slice(offset, offset + limit);

  const parents = await loadParents(merged.flatMap((row) => row.parents));

  const rows = merged.map((row): DeletedRecordView => {
    // The restore rule, asked in advance: the first parent that is still
    // deleted is the one to restore first. `write.ts` walks the same chain in
    // the same order and refuses on the same row.
    const blocker = row.parents
      .map((parent) => parents.get(`${parent.kind}:${parent.id}`))
      .find((parent) => parent?.deleted);

    // "It went with something else" is narrower than "its parent is also
    // deleted": the two share a delete event. A note deleted on its own last
    // week, whose recipe went today, has a blocker and no parent — and it
    // keeps its own date and its own reason when that recipe comes back.
    const withParent =
      blocker && row.eventId !== null && blocker.eventId === row.eventId
        ? { kind: blocker.kind, handle: blocker.handle }
        : null;

    return {
      kind: row.kind,
      id: row.id,
      address: row.address,
      handle: row.handle,
      deletedAt: row.deletedAt.toISOString(),
      deletedBy: row.deletedBy,
      reason: row.reason,
      withParent,
      restoreBlockedBy: blocker
        ? {
            kind: blocker.kind,
            handle: blocker.handle,
            address: blocker.address,
          }
        : null,
    };
  });

  return { rows, total };
}

/**
 * Is there a DELETED recipe at this slug?
 *
 * `get_recipe` asks, and only after `getRecipeBySlug` has already returned
 * null, so the cost is paid on a miss and never on a read that works.
 *
 * It belongs here for the reason the header gives: it names a base table, and
 * `read.ts` may not. It returns a boolean rather than the row on purpose —
 * the caller needs to choose between two refusals, and handing it a title, a
 * reason and a date would put a deleted record's contents in reach of a read
 * tool. The slug it answers about is the one the caller already sent.
 */
export async function isDeletedRecipe(slug: string): Promise<boolean> {
  const rows = await db
    .select({ id: recipes.id })
    .from(recipes)
    .where(and(eq(recipes.slug, slug), isNotNull(recipes.deletedAt)))
    .limit(1);
  return rows.length > 0;
}
