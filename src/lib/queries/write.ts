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
  recipeMassFlowStages,
  recipeMassFlows,
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
import {
  ambiguousUseMessage,
  isReservedTagSlug,
  qualifiedUseKey,
  qualifierMessage,
  splitQualifiedUse,
} from '@/lib/domain/schemas';
import type {
  AddMassFlowInput,
  AddNoteInput,
  BackfillRevisionInput,
  CreateRecipeInput,
  DescribeMechanismInput,
  IngredientLineInput,
  LogExperimentInput,
  MassFlowInput,
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
 *
 * The canonical name comes back beside the id because a qualified reference
 * is keyed on a name, not on an id: a line written under an alias has to be
 * reachable as "To serve: <alias>" and as "To serve: <canonical>", and only
 * the second of those survives a round trip through storage.
 */
async function findIngredient(
  tx: Tx,
  name: string,
): Promise<{ id: string; name: string } | null> {
  const trimmed = name.trim();
  const rows = await tx
    .select({ id: ingredients.id, name: ingredients.name })
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
  return rows[0] ?? null;
}

async function findIngredientId(tx: Tx, name: string): Promise<string | null> {
  return (await findIngredient(tx, name))?.id ?? null;
}

/**
 * Cross-check a revision's `uses` names against its ingredient lines when
 * one of the two lists was carried forward.
 *
 * `checkStepReferences` in the submission contract enforces the same rule at
 * the parse boundary, and it can only see what the caller sent. A revision
 * that replaces one list and inherits the other therefore reaches the write
 * layer unchecked, in both directions, and this is where the halves meet.
 *
 * Which half the caller wrote decides how a name is matched, because it
 * decides what the name can be trusted to mean.
 *
 * `byName` — the caller wrote the steps. The name in `uses` is the caller's
 * own spelling, so a name that fits exactly one line is not ambiguous,
 * whatever else it may also resolve to. That is what lets a recipe list one
 * ingredient twice under two spellings and still be revisable. Only a name
 * that fits no line falls through to the resolved ingredient, where
 * "Chinkiang vinegar" and "Black malt vinegar" are one thing.
 *
 * `byIngredient` — the caller wrote the lines. `copySteps` returns `uses` as
 * the canonical ingredient name, so the spelling that said which line the
 * step meant is already gone. Matching that canonical name against a line
 * that happens to be written the same way would pick a line by coincidence,
 * which is the whole defect: a step bound to the 400 g "To serve" line came
 * back as "Glutinous rice" and landed on the 40 g line. So the count is
 * taken over resolved ingredients, and a tie is refused rather than guessed.
 *
 * `missing` is optional because absence means different things in the two
 * directions. A caller writing steps against lines it did not send can still
 * fix a name it got wrong. A caller replacing the lines may have dropped an
 * ingredient on purpose, and its steps come forward still mentioning it.
 *
 * A `uses` string that names a component — "To serve: Glutinous rice" — is
 * tried only after the bare ladder above has failed to settle on one line,
 * and it splits the two directions again, on the same question of who wrote
 * the string. On `byName` the caller wrote it, so a heading no line carries
 * is refused and named: the qualifier is information the caller volunteered
 * and binding the step to some other line would be the defect this exists
 * to stop. On `byIngredient` the string came out of `copySteps`, so a
 * heading that no longer matches — the caller renamed it in the same call —
 * degrades to the bare tail and meets exactly today's decision. `hint.missing`
 * is what tells the two apart, because it is set on precisely the direction
 * where the caller wrote the steps. `hint.qualifier` then says how to get out
 * of that refusal, the way `hint.ambiguous` does for a tie: a caller sending
 * steps alone cannot give a line a heading it does not have without sending
 * the lines too, and the message has to say so.
 */
async function checkCarriedUses(
  tx: Tx,
  ingredientLines: IngredientLineInput[],
  steps: StepInput[],
  hint: {
    match: 'byName' | 'byIngredient';
    missing?: string;
    ambiguous: string;
    qualifier?: string;
  },
): Promise<void> {
  type Match = { line: IngredientLineInput; position: number };
  const linesByName = new Map<string, Match[]>();
  const linesById = new Map<string, Match[]>();
  const linesByQualified = new Map<string, Match[]>();
  const push = (map: Map<string, Match[]>, key: string, match: Match) => {
    const found = map.get(key);
    if (found) found.push(match);
    else map.set(key, [match]);
  };
  // One line may reach a qualified key by two names — the one it was written
  // under and the canonical one — and when those spell the same thing the
  // key must still hold one entry. A second entry for the same line would
  // count as a second line and refuse a reference that names exactly one.
  const pushQualified = (key: string, match: Match) => {
    const found = linesByQualified.get(key);
    if (!found) {
      linesByQualified.set(key, [match]);
      return;
    }
    if (found.some((other) => other.position === match.position)) return;
    found.push(match);
  };
  const resolved = await Promise.all(
    ingredientLines.map((line) => findIngredient(tx, line.name)),
  );
  ingredientLines.forEach((line, position) => {
    push(linesByName, line.name.trim().toLowerCase(), { line, position });
    const found = resolved[position];
    if (found) push(linesById, found.id, { line, position });
    const heading = line.component?.trim();
    if (!heading) return;
    pushQualified(qualifiedUseKey(heading, line.name), { line, position });
    if (found)
      pushQualified(qualifiedUseKey(heading, found.name), { line, position });
  });

  // The bare ladder, unchanged in both directions. It is a closure because a
  // carried qualified name whose heading no longer matches has to be run
  // through it a second time, on its bare tail.
  const matchBare = async (name: string): Promise<Match[] | undefined> => {
    if (hint.match === 'byName') {
      const byWritten = linesByName.get(name.trim().toLowerCase());
      if (byWritten) return byWritten;
      const id = await findIngredientId(tx, name);
      return id ? linesById.get(id) : undefined;
    }
    const id = await findIngredientId(tx, name);
    const byIngredient = id ? linesById.get(id) : undefined;
    return byIngredient ?? linesByName.get(name.trim().toLowerCase());
  };

  for (const [i, step] of steps.entries()) {
    for (const used of step.uses ?? []) {
      // Bare first, and it settles the reference before the string is
      // scanned for a colon, so nothing that resolves today moves.
      //
      // A bare name that fits TWO lines settles it as well, and only the
      // empty result falls through. `writeRevisionBody` resolves any bare
      // hit as authoritative and takes the first of them, so a string this
      // check approved through the qualified index would be written against
      // a different line — the contract naming one amount and the page
      // showing another. Two lines answering to the string as written is
      // the ambiguity ecf9390 refuses, and it stays refused.
      let matches = await matchBare(used);
      if (!matches) {
        const qualifier = splitQualifiedUse(used);
        if (qualifier) {
          const byComponent = linesByQualified.get(
            qualifiedUseKey(qualifier.component, qualifier.name),
          );
          if (byComponent) matches = byComponent;
          else if (hint.missing)
            throw new ConflictError(
              `${qualifierMessage(i + 1, used, qualifier, ingredientLines)}` +
                (hint.qualifier ? ` ${hint.qualifier}` : ''),
            );
          else matches = (await matchBare(qualifier.name)) ?? matches;
        }
      }
      if (!matches) {
        if (!hint.missing) continue;
        throw new ConflictError(
          `Step ${i + 1} uses "${used}", ${hint.missing}`,
        );
      }
      if (matches.length > 1) {
        throw new ConflictError(
          `${ambiguousUseMessage(i + 1, used, matches)} ${hint.ambiguous}`,
        );
      }
    }
  }
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
   *
   * **Two passes, and the order is the fix.** Indexing each line's two names
   * together as the lines were written let an earlier line's canonical name
   * take the key of a later line's *written* name. Two lines of one
   * ingredient under two spellings — 15 ml "Chinkiang vinegar" for a
   * dressing and 200 ml "Black malt vinegar" for a braise — put the braise
   * step's chip on the 15 ml line, silently, because line 1's canonical name
   * claimed "black malt vinegar" before line 2 reached it. A written name is
   * the name the caller chose for that line and nothing else may take it, so
   * every written name is claimed first and canonical names then fill only
   * the keys still free.
   *
   * What stays first-wins is two lines that a step can name only by one
   * shared canonical name. That tie carries no information to break it with;
   * `checkStepReferences` and `checkCarriedUses` refuse it wherever the
   * caller sent the list it belongs to.
   *
   * **A second index, keyed on the line's heading and its name together**,
   * is what gives a step a way to say which of two lines it means:
   * `uses: ["To serve: Glutinous rice"]`. It is a separate map with a
   * separate key space on purpose. Merging it into `lineIdByName` would let
   * a qualified reference be shadowed by a line whose written name happens
   * to equal it, and would let the two first-wins passes of one map
   * interfere with the other's. It runs the same two passes in the same
   * order and for the same reason, so a line written under an alias is
   * reachable as "To serve: <alias>" and, only if still free, as
   * "To serve: <canonical>".
   */
  const lineIdByName = new Map<string, string>();
  const indexLine = (name: string, id: string) => {
    const key = name.trim().toLowerCase();
    if (key && !lineIdByName.has(key)) lineIdByName.set(key, id);
  };
  const lineIdByQualified = new Map<string, string>();
  const indexQualified = (
    component: string | null,
    name: string,
    id: string,
  ) => {
    const heading = component?.trim();
    if (!heading || !name.trim()) return;
    const key = qualifiedUseKey(heading, name);
    if (!lineIdByQualified.has(key)) lineIdByQualified.set(key, id);
  };
  const written: {
    name: string;
    canonical: string;
    component: string | null;
    id: string;
  }[] = [];

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

    written.push({
      name: line.name,
      canonical: canonicalName,
      component: line.component ?? null,
      id: inserted[0]!.id,
    });
  }

  for (const line of written) indexLine(line.name, line.id);
  for (const line of written) indexLine(line.canonical, line.id);
  for (const line of written)
    indexQualified(line.component, line.name, line.id);
  for (const line of written)
    indexQualified(line.component, line.canonical, line.id);

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
      // Bare first. A name that resolves today resolves to the same line
      // after this, and a written name that itself contains a colon is
      // never split, because the split is only reached once the bare
      // lookup has come back empty.
      let lineId = lineIdByName.get(used.trim().toLowerCase());
      if (!lineId) {
        const qualifier = splitQualifiedUse(used);
        if (qualifier) {
          lineId = lineIdByQualified.get(
            qualifiedUseKey(qualifier.component, qualifier.name),
          );
          // The same degrade `checkCarriedUses` performs, and it has to be
          // here or the two layers disagree. A carried reference arrives
          // qualified whenever the PREVIOUS revision had two lines of one
          // name; an ingredients-only revision that leaves one of them —
          // dropping the other line, or renaming its heading — makes the
          // qualified key miss. The cross-check falls back to the bare tail,
          // finds exactly one line and lets the write through. Without the
          // same fallback here the step is written with no ingredient at
          // all: accepted, silent, and a link that ecf9390 kept.
          //
          // It cannot pick the wrong line. Every path that reaches it has
          // already proved the tail matches exactly one — Zod on create and
          // backfill, `checkCarriedUses` on both revise directions — so
          // `lineIdByName`'s first-wins has one candidate to be first among.
          lineId ??= lineIdByName.get(qualifier.name.trim().toLowerCase());
        }
      }
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

type NoteSubject = {
  recipeId?: string;
  revisionId?: string;
  stepId?: string;
  ingredientId?: string;
  experimentId?: string;
};

/**
 * The next free `notes.position` for one subject.
 *
 * A subject is whichever of the five columns is set — the check constraint
 * `note_has_exactly_one_subject` guarantees there is exactly one — so this
 * is `MAX(position) + 1` over the notes already hanging off it, and the
 * first note on a subject gets 1.
 *
 * The predicate names the one column that is set rather than testing all
 * five, so `idx_notes_recipe`, `idx_notes_revision` and
 * `idx_notes_ingredient` are usable and the lookup stays bounded by the
 * notes on that one subject.
 *
 * **No lock, and no unique index behind it.** Two connectors adding a note
 * to the same recipe at the same moment can both read the same maximum and
 * both write it. That is harmless here and locking for it would be worse:
 * `position` is the *tiebreak* under `created_at`, not the sort key, and
 * two concurrent transactions have two different `now()` values, so the
 * pair is still totally ordered and still stable. A unique index would
 * turn a harmless collision into a refused write on the second author.
 */
async function nextNotePosition(tx: Tx, subject: NoteSubject): Promise<number> {
  const where = subject.recipeId
    ? eq(notes.recipeId, subject.recipeId)
    : subject.revisionId
      ? eq(notes.revisionId, subject.revisionId)
      : subject.stepId
        ? eq(notes.stepId, subject.stepId)
        : subject.ingredientId
          ? eq(notes.ingredientId, subject.ingredientId)
          : subject.experimentId
            ? eq(notes.experimentId, subject.experimentId)
            : null;
  // No subject at all is a programming error the check constraint would
  // catch on insert; there is nothing to count against, so start at 1.
  if (!where) return 1;

  const [row] = await tx
    .select({ max: sql<number | null>`MAX(${notes.position})` })
    .from(notes)
    .where(where);
  return (row?.max ?? 0) + 1;
}

/**
 * Insert notes and their citations against a single subject column.
 * Returns the new note ids in the order given.
 *
 * **This is the only insert path for `notes` and `note_sources`**, which is
 * what lets `position` be assigned in one place. `createRecipe`,
 * `reviseRecipe`, `backfillRevision`, `addNote` and `logExperiment` all
 * come through here; nothing else touches either table except
 * `describeMechanism`, which updates one column on a note that exists.
 *
 * The array's own order is the order that gets stored — a caller writing
 * four mechanisms in the order a cook meets them gets them back that way,
 * on the recipe page and on both science screens. Before this column the
 * order came back as whatever the planner returned, because every note in
 * one call shares `created_at`; see the comment on `notes.position`.
 */
async function writeNotes(
  tx: Tx,
  subject: NoteSubject,
  list: NoteInput[] | undefined,
): Promise<string[]> {
  const ids: string[] = [];
  if (!list?.length) return ids;

  // Read once, then count up. One statement per call rather than one per
  // note, and correct inside the call because nothing else writes to this
  // subject while the transaction is open.
  let position = await nextNotePosition(tx, subject);

  for (const note of list) {
    const inserted = await tx
      .insert(notes)
      .values({
        kind: note.kind,
        title: note.title ?? null,
        body: note.body,
        conditions: note.conditions ?? [],
        position: position++,
        recipeId: subject.recipeId ?? null,
        revisionId: subject.revisionId ?? null,
        stepId: subject.stepId ?? null,
        ingredientId: subject.ingredientId ?? null,
        experimentId: subject.experimentId ?? null,
      })
      .returning({ id: notes.id });

    const noteId = inserted[0]!.id;
    ids.push(noteId);
    // A note is written once and its citations with it, so the position of
    // a source is simply its index in the list — there is no earlier
    // source on this note to count past. 1-based to match the backfill in
    // migration 0006, which numbers from row_number().
    let sourcePosition = 1;
    for (const source of note.sources ?? []) {
      await tx.insert(noteSources).values({
        noteId,
        url: source.url ?? null,
        title: source.title ?? null,
        citation: source.citation ?? null,
        accessedAt: source.accessedAt ?? null,
        position: sourcePosition++,
      });
    }
  }
  return ids;
}

/**
 * Write the mass flow figure for a revision.
 *
 * Append-only, and the only shape of write this table has. There is no
 * update path and no delete path, for the reason the whole model has none:
 * the numbers are a record of a batch that was actually weighed, and a
 * figure that can be rewritten is a measurement that can be quietly
 * replaced. A revision may be given one figure, once.
 *
 * The refusal is the half that makes the addition legal. `UNIQUE
 * (revision_id)` would raise a constraint violation on its own; this reads
 * the stored row first so the caller is told what is already there and that
 * a revise is the way to record a different batch.
 */
async function writeMassFlow(
  tx: Tx,
  revisionId: string,
  massFlow: MassFlowInput,
): Promise<string> {
  const existing = await tx
    .select({ id: recipeMassFlows.id, createdAt: recipeMassFlows.createdAt })
    .from(recipeMassFlows)
    .where(eq(recipeMassFlows.revisionId, revisionId))
    .limit(1);
  if (existing[0]) {
    throw new ConflictError(
      'This revision already has a mass flow figure, recorded on ' +
        `${existing[0].createdAt.toISOString().slice(0, 10)}. A figure ` +
        'cannot be changed once it is written: it records what a batch ' +
        'weighed. To record a different batch, add a revision with ' +
        'revise_recipe and send the figure with it.',
    );
  }

  const flowRow = await tx
    .insert(recipeMassFlows)
    .values({
      revisionId,
      netChangePercent: num(massFlow.netChangePercent),
      ratePercentPerDay: num(massFlow.ratePercentPerDay),
      note: massFlow.note ?? null,
    })
    .returning({ id: recipeMassFlows.id });
  const massFlowId = flowRow[0]!.id;

  for (const [index, stage] of massFlow.stages.entries()) {
    await tx.insert(recipeMassFlowStages).values({
      massFlowId,
      position: index,
      label: stage.label,
      quantity: num(stage.quantity),
      quantityMax: num(stage.quantityMax),
      unit: normaliseUnit(stage.unit),
      durationMinutes: stage.durationMinutes ?? null,
      durationMaxMinutes: stage.durationMaxMinutes ?? null,
      emphasis: stage.emphasis ?? false,
      rawText: stage.rawText ?? null,
    });
  }

  return massFlowId;
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
    if (input.massFlow) await writeMassFlow(tx, revisionId, input.massFlow);
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

    // A revision that replaces one list and carries the other forward was
    // not cross-checked by Zod, which only ever sees what the caller sent.
    // Both directions are checked here, where the carried-forward half is in
    // hand. A revision that sends neither list is left alone on purpose — it
    // copies steps and lines forward together, so refusing it would strand a
    // recipe that already holds two lines of one name and let nobody revise
    // it at all.
    if (input.steps && !input.ingredients) {
      // The caller wrote the steps against lines it did not send, so a name
      // that names nothing is a mistake it can still correct here.
      await checkCarriedUses(tx, ingredientLines, stepList, {
        match: 'byName',
        missing:
          "which is not in this recipe's ingredient list. Send " +
          '`ingredients` alongside `steps` to change both.',
        ambiguous:
          'Send `ingredients` alongside `steps` to give a line the new ' +
          'spelling.',
        qualifier:
          'Send `ingredients` alongside `steps` to give a line that ' +
          'component.',
      });
    } else if (input.ingredients && !input.steps) {
      // The mirror case, and the one the milestone's own defect survived in.
      // The caller replaced the lines and the steps came forward carrying
      // canonical names, so a step that named the 400 g line lands on the
      // 40 g one the moment two lines answer to that name. Only ambiguity is
      // refused: a line the caller deliberately dropped leaves its step
      // reference unresolvable, and `writeRevisionBody` drops that link the
      // way it always has.
      await checkCarriedUses(tx, ingredientLines, stepList, {
        match: 'byIngredient',
        ambiguous:
          'Send `steps` alongside `ingredients` to say which line each ' +
          'step means.',
      });
    }

    await writeRevisionBody(tx, revisionId, ingredientLines, stepList);
    // Deliberately not carried forward when omitted, unlike the ingredients
    // and the steps above. Those describe intent, and an unchanged intent
    // is still true of the new version. A mass flow is a measurement of one
    // batch, and copying it into a version nobody weighed would invent one.
    if (input.massFlow) await writeMassFlow(tx, revisionId, input.massFlow);
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
    if (input.massFlow) await writeMassFlow(tx, revisionId, input.massFlow);
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
      component: recipeIngredients.component,
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

  /**
   * How many lines of this revision answer to each name.
   *
   * A step's `uses` comes back out of storage as the canonical ingredient
   * name, and the spelling that said which line the step meant is not a
   * column. When two lines answer to that one name, the heading is the only
   * thing left that separates them, so it is written in front — and the
   * revision that replaces the lines and lets the steps come forward then
   * still binds each step to the line it had. Without this the qualified
   * form would work on `create_recipe` and die on the first ingredients-only
   * revision, which is the heavy path it exists to remove.
   *
   * The count is over every line in the revision, not only the referenced
   * ones, because the cross-check downstream counts the same way: a name
   * carried by two lines is ambiguous there even if one of them is named by
   * no step.
   *
   * Conditional, and that is what makes it safe. Every revision with no
   * duplicate name — the whole archive — comes back byte-identical to
   * before. And a caller who renames a heading in the same call finds the
   * carried qualifier missing, falls back to the bare name and gets exactly
   * today's behaviour, so no path that works today becomes a refusal.
   */
  const lineNames = await tx
    .select({
      name: sql<string>`COALESCE(${ingredients.name}, ${recipeIngredients.rawText})`,
    })
    .from(recipeIngredients)
    .leftJoin(ingredients, eq(ingredients.id, recipeIngredients.ingredientId))
    .where(eq(recipeIngredients.revisionId, revisionId));
  const linesPerName = new Map<string, number>();
  for (const row of lineNames) {
    const key = row.name.trim().toLowerCase();
    linesPerName.set(key, (linesPerName.get(key) ?? 0) + 1);
  }

  const usesByStep = new Map<string, string[]>();
  for (const row of usesRows) {
    const list = usesByStep.get(row.stepId) ?? [];
    const heading = row.component?.trim();
    const shared = (linesPerName.get(row.name.trim().toLowerCase()) ?? 0) > 1;
    list.push(heading && shared ? `${heading}: ${row.name}` : row.name);
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
        conditions: input.conditions,
        sources: input.sources,
      },
    ]);

    return { noteId: noteId! };
  });
}

/**
 * Attach a mass flow figure to a revision that already exists.
 *
 * **Why this is not an edit.** The append-only rule says a stored revision
 * is never changed — its ingredients, its steps, its rationale are what
 * they were. This adds a child row against a named revision and touches no
 * column of it, which is exactly what `addNote` has always done: a note
 * added today renders on a revision written last year and nobody calls that
 * a rewrite. R-SCR-39 makes the figure a MAY, so a revision without one is
 * already drawn correctly; this can only turn absent into present.
 *
 * The half that keeps it honest is `writeMassFlow`'s refusal. A revision
 * takes one figure and then refuses another, with an error that says what
 * is stored and that a revise is how a different batch gets recorded. So
 * this write is add-once, never change.
 *
 * It exists because no other path can reach the archive. `pnpm ingest`
 * skips a recipe that exists and `--force` adds revisions; a revise makes a
 * new version, and a version whose only change is a diagram breaks "every
 * revision records why it exists" and moves a number that is in URLs and in
 * the keys that remember ticked ingredients.
 */
export async function addMassFlow(
  input: AddMassFlowInput,
): Promise<{ slug: string; revisionNumber: number; massFlowId: string }> {
  return withTransaction(async (tx) => {
    const found = await tx
      .select({ id: recipes.id, currentRevisionId: recipes.currentRevisionId })
      .from(recipes)
      .where(eq(recipes.slug, input.slug))
      .limit(1);
    if (!found[0]) throw new NotFoundError(`No recipe "${input.slug}".`);

    let revisionId = found[0].currentRevisionId;
    let revisionNumber: number;

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
          `Recipe "${input.slug}" has no revision ${input.revisionNumber}.`,
        );
      }
      revisionId = rev[0].id;
      revisionNumber = input.revisionNumber;
    } else {
      if (!revisionId) {
        throw new NotFoundError(
          `Recipe "${input.slug}" has no current revision to describe.`,
        );
      }
      const rev = await tx
        .select({ revisionNumber: recipeRevisions.revisionNumber })
        .from(recipeRevisions)
        .where(eq(recipeRevisions.id, revisionId))
        .limit(1);
      revisionNumber = rev[0]!.revisionNumber;
    }

    const massFlowId = await writeMassFlow(tx, revisionId, {
      stages: input.stages,
      netChangePercent: input.netChangePercent,
      ratePercentPerDay: input.ratePercentPerDay,
      note: input.note,
    });

    // Nothing on `recipes` and nothing on `recipe_revisions` moves — not the
    // current revision pointer, not a single stored column. The same
    // restraint `backfillRevision` keeps, and for the same reason.
    return { slug: input.slug, revisionNumber, massFlowId };
  });
}

/**
 * Give a science note the conditions it holds under.
 *
 * The same shape of write as `addMassFlow`, one level down, and the same
 * argument: every science note in the archive was written before the column
 * existed, and a note is append-only — the model's answer to a wrong note
 * is a `correction`, not an edit. This fills a field that has never held a
 * value, so it can only turn absent into present. A note whose conditions
 * are already written is refused, and the error says what is there.
 *
 * `notes.updatedAt` moves, because the record of the note did change. That
 * column has existed since the first migration and nothing has ever moved
 * it, which is the point: this is the first write that has anything to say.
 *
 * WHY THE ROW IS LOCKED AND THE TEST IS WRITTEN TWICE. "Written once" is
 * enforced here and nowhere else. `addMassFlow` makes the same promise and
 * has `uq_mass_flow_revision` standing behind it, so its read-then-write is
 * belt over braces; an array column has no constraint of that shape, and a
 * bare read-then-write is only advisory under READ COMMITTED. Two callers
 * that describe the same note at the same time both read `{}`, both pass
 * the guard, and the second silently replaces the first — which is the one
 * thing this whole function exists to make impossible, and the connector is
 * multi-client by design, so it is reachable rather than theoretical.
 *
 * `FOR UPDATE` makes the second caller wait on the row. READ COMMITTED then
 * re-reads it after the first commits, so the second sees the stored
 * conditions and is refused with the same sentence a sequential caller
 * gets, naming what is there. The emptiness test repeated in the UPDATE's
 * own WHERE clause is the backstop: it cannot report what is stored, but it
 * refuses rather than overwrites if the lock is ever lost.
 */
export async function describeMechanism(
  input: DescribeMechanismInput,
): Promise<{ noteId: string; conditions: string[] }> {
  return withTransaction(async (tx) => {
    const found = await tx
      .select({
        id: notes.id,
        kind: notes.kind,
        title: notes.title,
        conditions: notes.conditions,
      })
      .from(notes)
      .where(eq(notes.id, input.noteId))
      .limit(1)
      .for('update');
    const note = found[0];
    if (!note) throw new NotFoundError(`No note with id "${input.noteId}".`);

    if (note.conditions.length > 0) {
      throw new ConflictError(
        `That note already states its conditions: ` +
          `${note.conditions.join(' · ')}. They cannot be changed. If they ` +
          'are wrong, add a note of kind "correction" that says so.',
      );
    }

    const written = await tx
      .update(notes)
      .set({ conditions: input.conditions, updatedAt: new Date() })
      .where(
        and(
          eq(notes.id, input.noteId),
          sql`cardinality(${notes.conditions}) = 0`,
        ),
      )
      .returning({ id: notes.id });

    if (written.length === 0) {
      throw new ConflictError(
        'That note states its conditions already. They cannot be changed. ' +
          'If they are wrong, add a note of kind "correction" that says so.',
      );
    }

    return { noteId: input.noteId, conditions: input.conditions };
  });
}

/**
 * Give a taxonomy term its display label, blurb and place in the hierarchy.
 *
 * Creates the term when it does not exist, so this is also how a term is
 * authored ahead of any recipe using it. `description` and `parentSlug` are
 * only written when supplied — passing just a label will not blank out a
 * blurb that is already there. Pass an explicit `null` to clear one.
 *
 * THE RESULT REPORTS THE PARENT, ALWAYS — the one it just set, the one it
 * just cleared, or the stored one an omitted `parentSlug` left alone. It was
 * reported nowhere before, and `list_categories` did not carry it either, so
 * a caller could not see what its own call had done to the hierarchy. An
 * agent that named a parent, got `{"created": false}` back, and had no way
 * to check it, filed a report saying the argument was discarded. It was not
 * discarded; it was invisible, which from the outside is the same thing.
 */
export async function upsertCategory(input: UpsertCategoryInput): Promise<{
  categoryType: CategoryType;
  slug: string;
  created: boolean;
  /** The broader tag this one now sits under. Always in the same category
      type, so it needs no type of its own. `null` means it is top level. */
  parent: { slug: string; label: string } | null;
}> {
  return withTransaction(async (tx) => {
    /** Read a parent back for the result, by id. */
    const parentById = async (id: string | null) => {
      if (!id) return null;
      const rows = await tx
        .select({ slug: taxonomyTerms.slug, label: taxonomyTerms.label })
        .from(taxonomyTerms)
        .where(eq(taxonomyTerms.id, id))
        .limit(1);
      return rows[0] ?? null;
    };

    const slug = input.slug ? slugify(input.slug) : slugify(input.label);
    // Unreachable: `slugify` falls back to 'untitled' rather than returning
    // an empty string. Kept as a guard, worded the way a reader would read
    // it if it ever did fire.
    if (!slug) throw new Error('Tag label does not produce a usable slug.');

    let parentId: string | null | undefined;
    let namedParent: { slug: string; label: string } | null = null;
    if (input.parentSlug !== undefined) {
      if (input.parentSlug === null) {
        parentId = null;
      } else {
        const parentSlug = slugify(input.parentSlug);
        // ConflictError, not a bare Error: `runTool` in src/lib/mcp/tools.ts
        // returns only the four classes it trusts verbatim and reports every
        // other throw as "An internal error occurred". A caller told that
        // cannot tell a bad argument from a broken server, so the two
        // refusals below name themselves.
        if (parentSlug === slug) {
          throw new ConflictError(
            'A tag cannot be its own parent. Pass parentSlug: null to clear ' +
              'the parent, or name a different tag.',
          );
        }
        // Scoped to the same facet on purpose: a cuisine parented to a
        // technique would make the hierarchy meaningless, and silently
        // dropping it would hide the mistake.
        const parent = await tx
          .select({
            id: taxonomyTerms.id,
            slug: taxonomyTerms.slug,
            label: taxonomyTerms.label,
          })
          .from(taxonomyTerms)
          .where(
            and(
              eq(taxonomyTerms.facet, input.categoryType),
              eq(taxonomyTerms.slug, parentSlug),
            ),
          )
          .limit(1);
        if (!parent[0]) {
          throw new NotFoundError(
            `No tag "${parentSlug}" in the "${input.categoryType}" category ` +
              'to use as parent. Pass parentSlug: null to clear the parent ' +
              'instead.',
          );
        }
        // AFTER the lookup, not before it, and the order carries the whole
        // meaning. A reserved word is refused as a NAME by
        // `upsertCategorySchema`, so no tag can be given one from here on;
        // a tag that has one is a legacy accident from before that rule.
        // Checking first would replace the message above — which already
        // names the slug and already says that an explicit `null` clears a
        // parent — for every caller who simply typed the wrong slug. So the
        // reserved check fires only where it has something to say: the junk
        // tag is really there, and the caller is about to be parented onto
        // it and told nothing.
        if (isReservedTagSlug(parentSlug)) {
          throw new ConflictError(
            `The tag "${parentSlug}" exists, but its name is a reserved ` +
              'word, so it is a tag somebody made by accident. It will not ' +
              'be used as a parent. To clear the parent, send parentSlug as ' +
              'JSON null — the value null, not the four letters in quotes. ' +
              'To set a parent, name a tag that groups something.',
          );
        }
        parentId = parent[0].id;
        namedParent = { slug: parent[0].slug, label: parent[0].label };
      }
    }

    const existing = await tx
      .select({ id: taxonomyTerms.id, parentId: taxonomyTerms.parentId })
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
      return {
        categoryType: input.categoryType,
        slug,
        created: false,
        // An omitted `parentSlug` wrote nothing, so the result says what is
        // stored rather than saying null and reading as a clear.
        parent:
          parentId === undefined
            ? await parentById(existing[0].parentId)
            : namedParent,
      };
    }

    await tx.insert(taxonomyTerms).values({
      facet: input.categoryType,
      slug,
      label: input.label,
      description: input.description ?? null,
      parentId: parentId ?? null,
    });
    return {
      categoryType: input.categoryType,
      slug,
      created: true,
      parent: namedParent,
    };
  });
}

/**
 * Give a canonical ingredient its names, category, density and aliases.
 *
 * Creates the ingredient when the slug is free, so this is also how one is
 * authored ahead of any recipe using it — and how a stub `resolveIngredient`
 * auto-created gets enriched. Every optional field is written only when it is
 * supplied, the same rule `upsertCategory` follows: sending a name alone will
 * not blank a description, a density or a list of aliases that is already
 * there. Pass an explicit `null` to clear one. `aliases` replaces the stored
 * list when it is sent, `substitutes` only ever adds.
 */
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

    // The same invariant, on the field that names the row.
    //
    // The alias guard below stated it — "two ingredients cannot answer to
    // the same name" — and checked every field except `name`. So
    // `upsert_ingredient {name: 'silverside'}` against a beef silverside
    // that carries "silverside" as an alias made a second canonical row and
    // took the name over: `resolveIngredient` matches by slug before it
    // matches by alias, so every later line naming silverside bound to the
    // new empty stub. Nothing in this repository deletes a row, so the split
    // list is permanent.
    const nameOwnerId = await findIngredientId(tx, input.name);
    if (nameOwnerId && nameOwnerId !== existing[0]?.id) {
      const owner = await tx
        .select({ slug: ingredients.slug, name: ingredients.name })
        .from(ingredients)
        .where(eq(ingredients.id, nameOwnerId))
        .limit(1);
      throw new ConflictError(
        `The name "${input.name}" already resolves to "${owner[0]?.name}" ` +
          `(${owner[0]?.slug}). Two ingredients cannot answer to the same ` +
          'name: a recipe line naming it would bind to one of them without ' +
          `saying which. Send slug: "${owner[0]?.slug}" to change that ` +
          'ingredient, or pick a name that no ingredient answers to.',
      );
    }

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

    // Only the keys the caller actually sent. `??` fallbacks here would make
    // an omission indistinguishable from an explicit clear, and this object
    // is handed whole to `.set()` — so leaving `description` out of a call
    // that only fixes a name would erase the description. On the INSERT
    // branch an absent key falls to the column default, which is what gives
    // a new row `category = 'other'` and `aliases = '{}'`.
    const values = {
      slug,
      name: input.name,
      ...(input.plural !== undefined ? { plural: input.plural ?? null } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.description !== undefined
        ? { description: input.description ?? null }
        : {}),
      ...(input.densityGPerMl !== undefined
        ? { densityGPerMl: num(input.densityGPerMl) }
        : {}),
      ...(input.defaultUnit !== undefined
        ? { defaultUnit: normaliseUnit(input.defaultUnit) }
        : {}),
      ...(input.aliases !== undefined ? { aliases: input.aliases } : {}),
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

    // Read the stored run first. The revision the run already points at is
    // part of what carries forward, so it has to be in hand before the
    // recipe is resolved.
    const existing = await tx
      .select({
        id: experiments.id,
        recipeId: experiments.recipeId,
        revisionId: experiments.revisionId,
      })
      .from(experiments)
      .where(eq(experiments.slug, slug))
      .limit(1);

    // `undefined` until a recipe slug is resolved, so the update below can
    // tell "the caller named no recipe" from "the caller named this one".
    let recipeId: string | null | undefined;
    let revisionId: string | null | undefined;
    if (input.recipeSlug === null) {
      // An explicit null unlinks the run. Omission carries the link forward,
      // so without this a run linked to the wrong recipe could never be
      // corrected to "belongs to no recipe".
      recipeId = null;
      revisionId = null;
    } else if (input.recipeSlug) {
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
      } else if (
        existing[0] &&
        existing[0].recipeId === recipeId &&
        existing[0].revisionId
      ) {
        // An experiment is a record of one revision, so a re-log that names
        // the same recipe again must not move the run onto whatever version
        // is current now. Only a new `revisionNumber`, or a move to a
        // different recipe, re-points it.
        revisionId = existing[0].revisionId;
      } else {
        revisionId = found[0].currentRevisionId;
      }
    }

    // Same rule as `upsertIngredient`: only the keys the caller sent, because
    // re-logging one slug updates the stored run rather than appending a
    // second one. Adding an observation to a finished batch must not blank
    // its cost, its dates or the recipe it belongs to. `currency` carries
    // forward too; the column default supplies 'EUR' on a first insert.
    // `revisionId` travels with `recipeId` because the two are one fact: a
    // run records one version of one recipe.
    const values = {
      slug,
      ...(recipeId !== undefined
        ? { recipeId, revisionId: revisionId ?? null }
        : {}),
      title: input.title,
      ...(input.summary !== undefined
        ? { summary: input.summary ?? null }
        : {}),
      ...(input.startedAt !== undefined
        ? { startedAt: input.startedAt ?? null }
        : {}),
      ...(input.completedAt !== undefined
        ? { completedAt: input.completedAt ?? null }
        : {}),
      ...(input.scaleFactor !== undefined
        ? { scaleFactor: num(input.scaleFactor) }
        : {}),
      ...(input.outcome !== undefined
        ? { outcome: input.outcome ?? null }
        : {}),
      ...(input.costTotal !== undefined
        ? { costTotal: num(input.costTotal) }
        : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      updatedAt: new Date(),
    };

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

    /**
     * Re-logging an experiment replaces its measurements rather than
     * appending duplicates — the labels ("A1", "piece 3") are stable
     * identities within a run, not a time series.
     *
     * Replace, but only when a list was sent. The delete used to be
     * unconditional, so a re-log correcting the title alone destroyed every
     * item and every observation of the run — silently, and with no revision
     * history to recover from. The measurements are the whole value of a
     * batch log. Both lists move together because an observation names an
     * item by label: replacing the observations while keeping stale items,
     * or the reverse, would leave the two halves describing different runs.
     */
    const replaceMeasurements =
      input.items !== undefined || input.observations !== undefined;
    if (replaceMeasurements) {
      await tx
        .delete(experimentObservations)
        .where(eq(experimentObservations.experimentId, experimentId));
      await tx
        .delete(experimentItems)
        .where(eq(experimentItems.experimentId, experimentId));
    }

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

    // The counts describe what the run holds now, not what this call sent.
    // A call that sends no list leaves the stored measurements alone, and
    // reporting 0 for them would read as "they are gone".
    if (!replaceMeasurements) {
      const stored = await tx
        .select({
          items: sql<number>`(SELECT count(*) FROM ${experimentItems}
             WHERE ${experimentItems.experimentId} = ${experimentId})`,
          observations: sql<number>`(SELECT count(*) FROM ${experimentObservations}
             WHERE ${experimentObservations.experimentId} = ${experimentId})`,
        })
        .from(experiments)
        .where(eq(experiments.id, experimentId))
        .limit(1);
      return {
        slug,
        itemCount: Number(stored[0]?.items ?? 0),
        observationCount: Number(stored[0]?.observations ?? 0),
      };
    }

    return { slug, itemCount: itemIdByLabel.size, observationCount };
  });
}
