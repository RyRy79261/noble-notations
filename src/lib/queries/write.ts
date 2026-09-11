import 'server-only';

/**
 * Write path for the repository.
 *
 * Every function here is the *only* supported way to change its part of the
 * model, and each one runs in a single transaction.
 *
 * The rule that shapes most of it: a dish that changed gets a REVISION.
 * `reviseRecipe` appends a version and moves `recipes.current_revision_id`, so
 * the history of how a dish got good is preserved rather than overwritten.
 *
 * The rule that shapes the rest of it, and it is a different act: a record
 * that is WRONG gets a correction. `updateRecipe`, `updateRevision` and
 * `updateNote` change a stored record in place, make no version and move no
 * number, and take no rationale — a rationale is the record of why the dish
 * changed, and a correction is the statement that it did not. The question
 * that separates the two is written into every tool description that touches
 * them: **did the food change, or is the record wrong?**
 *
 * `deleteRecord` and `restoreRecord` are the third act. A delete is SOFT: the
 * row stays, it stops being visible, and a restore brings it and everything
 * that went with it back. See `src/db/schema.ts` for the four columns and why
 * this is never called an archive.
 */
import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
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
  DELETABLE_KINDS,
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
  DeletableKind,
  DescribeMechanismInput,
  IngredientLineInput,
  LogExperimentInput,
  MassFlowInput,
  NoteInput,
  ReviseRecipeInput,
  StepInput,
  CategoryType,
  CategoriesInput,
  UpdateNoteInput,
  UpdateRecipeInput,
  UpdateRevisionInput,
  UpsertIngredientInput,
  UpsertCategoryInput,
} from '@/lib/domain/schemas';

export type { DeletableKind };

type Tx = TransactionClient;

/** Postgres `numeric` round-trips as a string in drizzle. */
function num(value: number | null | undefined): string | null {
  return value == null ? null : String(value);
}

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

// ─────────────────────────────────────────────────────────────────────────
// Soft delete — the two halves of the rule every write below obeys
//
//   A write that names a deleted row by its own key RESTORES it when the
//   tool is an UPSERT, and REFUSES when the tool APPENDS or CORRECTS.
//
// An upsert says "this is what the record should be", and naming an
// ingredient in a real recipe line is proof that the ingredient exists — so
// failing a whole recipe over a bookkeeping state would be the wrong trade.
// A tool that appends to a record, or corrects one, is naming something it
// believes is there; telling it the row is deleted is information it can act
// on, and silently writing into an invisible record is not.
//
// Every refusal is a ConflictError and never a NotFoundError: the row EXISTS.
// It also has to be one of the classes `runTool` in src/lib/mcp/tools.ts
// trusts, or the caller reads "An internal error occurred" and cannot tell a
// recoverable state from a broken server.
// ─────────────────────────────────────────────────────────────────────────

/** Written to every row one delete call touches, the root included. */
interface DeleteStamp {
  deletedAt: Date;
  deletedBy: string | null;
  deletedReason: string | null;
  deletedEventId: string;
}

/** What a restore writes. Named once so no caller clears three of four. */
const LIVE = {
  deletedAt: null,
  deletedBy: null,
  deletedReason: null,
  deletedEventId: null,
} as const;

/** The sentence every refusal-on-deleted shares. */
function deletedRefusal(handle: string): string {
  return `${handle} is deleted. Call restore_record to bring it back first.`;
}

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
 *
 * **A deleted ingredient is restored rather than matched around.** This runs
 * inside a recipe write, where the caller has named a real ingredient in a
 * real line — that is proof the ingredient exists, and it is the upsert half
 * of the rule at the top of this file. Refusing here would fail a whole
 * recipe over a bookkeeping state the caller cannot see and did not ask
 * about; skipping the row and minting a second one would be worse still,
 * because the slug is unique and the insert would collide. The restore is
 * silent because there is nowhere in a recipe's result to say it; the tools
 * that address an ingredient directly — `upsert_ingredient` — report it.
 */
/**
 * One ingredient line as the write layer moves it between revisions.
 *
 * `carriedIngredientId` is not part of the submission contract and no caller
 * can send one: `schemas.ts` defines the shape an agent writes, and this
 * field exists only between `copyIngredientLines` and `writeRevisionBody`.
 */
type CarriedIngredientLine = IngredientLineInput & {
  carriedIngredientId?: string | null;
};

/**
 * The ingredient a KEPT line already pointed at, by id.
 *
 * No match by name, and deliberately no restore. The caller did not name
 * this ingredient — the previous revision did, and this call is carrying its
 * line forward unchanged. A line whose ingredient is deleted keeps pointing
 * at the deleted row and renders as its own text, exactly as it did on the
 * revision it came from.
 */
async function carriedIngredient(
  tx: Tx,
  id: string,
  fallbackName: string,
): Promise<{ id: string; canonicalName: string }> {
  const rows = await tx
    .select({ id: ingredients.id, name: ingredients.name })
    .from(ingredients)
    .where(eq(ingredients.id, id))
    .limit(1);
  const row = rows[0];
  // A row that is gone entirely is not a state this schema allows — the id
  // came out of a `recipe_ingredients` row whose FK names it — so this falls
  // back to the ordinary path rather than inventing an error for it.
  if (!row) return resolveIngredient(tx, fallbackName);
  return { id: row.id, canonicalName: row.name };
}

async function resolveIngredient(
  tx: Tx,
  name: string,
): Promise<{ id: string; canonicalName: string }> {
  const trimmed = name.trim();
  const slug = slugify(trimmed);

  const bySlug = await tx
    .select({
      id: ingredients.id,
      name: ingredients.name,
      deletedAt: ingredients.deletedAt,
    })
    .from(ingredients)
    .where(eq(ingredients.slug, slug))
    .limit(1);
  if (bySlug[0]) {
    if (bySlug[0].deletedAt) await restoreIngredientRow(tx, bySlug[0].id);
    return { id: bySlug[0].id, canonicalName: bySlug[0].name };
  }

  const byNameOrAlias = await tx
    .select({
      id: ingredients.id,
      name: ingredients.name,
      deletedAt: ingredients.deletedAt,
    })
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
    if (byNameOrAlias[0].deletedAt) {
      await restoreIngredientRow(tx, byNameOrAlias[0].id);
    }
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
 * It sees DELETED rows, and must. `ingredients.slug` is unique whatever the
 * row's state, so a deleted ingredient still owns its name — filtering it out
 * here would make `upsertIngredient`'s collision guard pass and the insert
 * then fail on the unique index, with a message nobody can act on.
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

/**
 * Find (or create) a taxonomy term within a facet.
 *
 * A deleted tag is restored rather than matched around, for the reason
 * `resolveIngredient` gives: this runs inside a recipe write, `uq_taxonomy_
 * facet_slug` means a second row cannot be minted anyway, and tagging a
 * recipe with a name is a statement that the name is in use.
 */
async function resolveTermId(
  tx: Tx,
  facet: CategoryType,
  label: string,
): Promise<string> {
  const trimmed = label.trim();
  const slug = slugify(trimmed);
  const existing = await tx
    .select({ id: taxonomyTerms.id, deletedAt: taxonomyTerms.deletedAt })
    .from(taxonomyTerms)
    .where(and(eq(taxonomyTerms.facet, facet), eq(taxonomyTerms.slug, slug)))
    .limit(1);
  if (existing[0]) {
    if (existing[0].deletedAt) await restoreTermRow(tx, existing[0].id);
    return existing[0].id;
  }

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

/**
 * Replace a recipe's taxonomy assignments wholesale.
 *
 * WHOLESALE MEANS THE LIVE ONES. `get_recipe` shows a recipe's tags through
 * the live view, so a tag that is deleted is not in the list the caller is
 * told to send back — "Call get_recipe first. Then send back each tag that
 * you want to keep" is this tool's own instruction. Clearing every edge and
 * rewriting from that list therefore destroyed the edge to a deleted tag,
 * permanently and with no correct call available to prevent it: the caller
 * could not see the tag, and `recipe_terms` carries no delete stamp of its
 * own to restore from. Scoping the delete to edges whose tag is live leaves
 * that one edge alone, so restoring the tag puts the recipe back on it.
 */
async function applyTaxonomy(
  tx: Tx,
  recipeId: string,
  taxonomy: CategoriesInput,
): Promise<void> {
  if (!taxonomy) return;
  await tx.execute(
    sql`DELETE FROM recipe_terms rt
          USING taxonomy_terms t
          WHERE t.id = rt.term_id
            AND t.deleted_at IS NULL
            AND rt.recipe_id = ${recipeId}`,
  );

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
  ingredientLines: CarriedIngredientLine[],
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
    const { id: ingredientId, canonicalName } = line.carriedIngredientId
      ? await carriedIngredient(tx, line.carriedIngredientId, line.name)
      : await resolveIngredient(tx, line.name);
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
 * Write the mass flow figure for a revision, refusing a second one.
 *
 * `add_mass_flow` is FILL-ONCE and stays fill-once: it records what a batch
 * weighed, and a tool that can quietly replace a measurement is a tool that
 * can make a stored number stop being a fact. That promise is now LOCAL TO
 * THIS TOOL rather than a property of the whole model — `update_revision`
 * corrects a figure that is wrong — so the refusal says which tool does
 * which, and the two sentences it used to end with ("cannot be changed once
 * it is written") would have become false the day this branch landed.
 *
 * `UNIQUE (revision_id)` would raise a constraint violation on its own; this
 * reads the stored row first so the caller is told what is already there.
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
        `${existing[0].createdAt.toISOString().slice(0, 10)}. This tool ` +
        'does not replace a figure: it records what a batch weighed. To ' +
        'record a different batch, call revise_recipe and send the figure ' +
        'with it. To correct a figure that is wrong, call update_revision.',
    );
  }

  return insertMassFlow(tx, revisionId, massFlow);
}

/**
 * The insert half, with no opinion about what was there before.
 *
 * Split out for `replaceMassFlow`, which `update_revision` uses: the refusal
 * above has to stay intact for `add_mass_flow`, and a correction has to be
 * able to get past it.
 */
async function insertMassFlow(
  tx: Tx,
  revisionId: string,
  massFlow: MassFlowInput,
): Promise<string> {
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

/**
 * Replace a revision's figure, or remove it.
 *
 * `null` deletes the flow and its stages go with it by FK cascade — a mass
 * flow stage is a CHILD (see `DELETABLE_KINDS`): it has no delete of its own
 * and no `deleted_at`, and a caller removes one by sending the list without
 * it. Only `update_revision` reaches this.
 */
async function replaceMassFlow(
  tx: Tx,
  revisionId: string,
  massFlow: MassFlowInput | null,
): Promise<string | null> {
  await tx
    .delete(recipeMassFlows)
    .where(eq(recipeMassFlows.revisionId, revisionId));
  if (!massFlow) return null;
  return insertMassFlow(tx, revisionId, massFlow);
}

/**
 * Replace a recipe's outgoing links. Unknown targets are reported, not silent.
 *
 * Scoped to links whose target is LIVE, for the reason `applyTaxonomy` gives:
 * `get_recipe` does not show a link to a deleted recipe, so a caller sending
 * back the list it was shown cannot keep one, and a hard delete here is not
 * recoverable by restoring the target.
 */
async function applyLinks(
  tx: Tx,
  fromRecipeId: string,
  links: CreateRecipeInput['links'],
): Promise<string[]> {
  if (!links) return [];
  const unresolved: string[] = [];
  await tx.execute(
    sql`DELETE FROM recipe_links l
          USING recipes r
          WHERE r.id = l.to_recipe_id
            AND r.deleted_at IS NULL
            AND l.from_recipe_id = ${fromRecipeId}`,
  );

  for (const link of links) {
    const target = await tx
      .select({
        id: recipes.id,
        title: recipes.title,
        slug: recipes.slug,
        deletedAt: recipes.deletedAt,
      })
      .from(recipes)
      .where(eq(recipes.slug, link.slug))
      .limit(1);
    if (!target[0]) {
      unresolved.push(link.slug);
      continue;
    }
    // A deleted target is NOT an unresolved link. The row exists, so a report
    // saying "that slug is not here" would send the caller looking for a
    // spelling mistake that is not there. It is refused instead, and the
    // refusal names the way out — unless this recipe already links to it, in
    // which case the caller is echoing back an edge that survived the delete
    // above and is asking for nothing to change. Refusing that would make an
    // ordinary correction impossible for any recipe holding such an edge.
    if (target[0].deletedAt) {
      const held = await tx
        .select({ id: recipeLinks.id })
        .from(recipeLinks)
        .where(
          and(
            eq(recipeLinks.fromRecipeId, fromRecipeId),
            eq(recipeLinks.toRecipeId, target[0].id),
            eq(recipeLinks.kind, link.kind),
          ),
        )
        .limit(1);
      if (held[0]) continue;
      throw new ConflictError(
        deletedRefusal(`${target[0].title} (${target[0].slug})`),
      );
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
 *
 * LIVE ROWS ONLY, and this is the one place a write RESULT could leak a
 * deleted record. `read.ts` reaches every table through a view and a census
 * checks it, but a write result is outside both. A deleted tag named here
 * reaches the caller as a slug and a label, and `followUpMessage` in
 * `tools.ts` then tells the model to call `upsert_category` on it — which
 * restores it. So a write that mentions no deleted record cannot undo a
 * delete by accident. `write.ts` is allowed the base tables, so the filter
 * is stated rather than borrowed from a view.
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
    .where(
      and(isNull(taxonomyTerms.deletedAt), eq(recipeTerms.recipeId, recipeId)),
    );

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
    .where(
      and(
        isNull(ingredients.deletedAt),
        eq(recipeIngredients.revisionId, revisionId),
      ),
    );

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
    /**
     * Every slug, DELETED ONES INCLUDED, and that is deliberate. A slug is
     * the public address of a recipe and a deleted recipe still holds
     * `/recipes/laab-moo`; handing the name to a second recipe would make
     * restoring the first impossible and would point an old link at a
     * different dish. So `uniqueSlug` counts them and picks `laab-moo-2`.
     */
    const taken = await tx
      .select({ slug: recipes.slug, deletedAt: recipes.deletedAt })
      .from(recipes);
    const desired = input.slug ?? slugify(input.title);

    if (input.slug) {
      const clash = taken.find((r) => r.slug === input.slug);
      if (clash) {
        throw new ConflictError(
          clash.deletedAt
            ? `A recipe with slug "${input.slug}" is deleted. Call ` +
                `restore_record { kind: "recipe", slug: "${input.slug}" } to ` +
                'bring it back, or choose a different slug.'
            : `A recipe with slug "${input.slug}" already exists. Use ` +
                'revise_recipe to add a revision, or choose a different slug.',
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
        deletedAt: recipes.deletedAt,
      })
      .from(recipes)
      .where(eq(recipes.slug, input.slug))
      .limit(1);
    const recipe = found[0];
    if (!recipe) {
      throw new NotFoundError(`No recipe with slug "${input.slug}".`);
    }
    // Appending a version to an invisible recipe would write a revision
    // nobody can read and report success. ConflictError, not NotFoundError:
    // the recipe is there.
    if (recipe.deletedAt) {
      throw new ConflictError(
        deletedRefusal(`${recipe.title} (${input.slug})`),
      );
    }

    /**
     * The version this one supersedes, and it must be a LIVE one.
     *
     * `isNull(deletedAt)` is the backstop, not the fix. `current_revision_id`
     * is supposed to name a live revision — `deleteRecord` moves it off a
     * revision it removes, under a lock, and `updateRecipe` refuses to move
     * it onto a deleted one — but this read is where a pointer that is wrong
     * for any reason does the most damage: everything an omitted list carries
     * forward comes from here, so a deleted revision read as `previous` puts
     * its ingredients and its steps back on the public page, inside a new
     * live revision, with no `restore_record` called and nothing to say it
     * happened. A missed carry-forward is a visible, correctable mistake; a
     * silent republication of withdrawn content is not.
     */
    const previous = recipe.currentRevisionId
      ? (
          await tx
            .select()
            .from(recipeRevisions)
            .where(
              and(
                eq(recipeRevisions.id, recipe.currentRevisionId),
                isNull(recipeRevisions.deletedAt),
              ),
            )
            .limit(1)
        )[0]
      : undefined;

    // Over EVERY revision, deleted ones included. A deleted number is
    // retired: the row still holds it, so the next version takes a fresh one
    // and `/recipes/<slug>/revisions/3` for a deleted 3 answers 404 forever
    // rather than quietly drawing a different version.
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
      .select({
        id: recipes.id,
        title: recipes.title,
        deletedAt: recipes.deletedAt,
      })
      .from(recipes)
      .where(eq(recipes.slug, input.slug))
      .limit(1);
    const recipe = found[0];
    if (!recipe) {
      throw new NotFoundError(`No recipe with slug "${input.slug}".`);
    }
    if (recipe.deletedAt) {
      throw new ConflictError(
        deletedRefusal(`${recipe.title} (${input.slug})`),
      );
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

/**
 * Read a revision's ingredient lines back out in submission shape.
 *
 * EACH LINE CARRIES THE INGREDIENT ID IT ALREADY HAD, and that is not an
 * optimisation. `name` here is the CANONICAL name, read off the base table
 * so a line whose ingredient is deleted still comes back holding it. Sending
 * that name back through `resolveIngredient` — which restores on a slug hit,
 * by design, because a caller naming an ingredient in a real line is proof
 * it exists — silently un-deleted an ingredient for any `revise_recipe` or
 * `update_revision` that changed only the steps. The caller named nothing:
 * the write layer did, by echoing its own row back at itself. Carrying the
 * id means a kept line keeps pointing at the row it pointed at, whatever
 * state that row is in, and `restore_record` on the ingredient is what
 * brings it back.
 */
async function copyIngredientLines(
  tx: Tx,
  revisionId: string,
): Promise<CarriedIngredientLine[]> {
  const rows = await tx
    .select({
      ingredientId: recipeIngredients.ingredientId,
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
    carriedIngredientId: r.ingredientId,
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

/**
 * Turn a note's subject arguments into the one column that carries it.
 *
 * Shared by `addNote` and `updateNote`, so "which of the five columns does
 * `recipeSlug` with a `revisionNumber` mean" is answered once. Every lookup
 * refuses a deleted record: a note is an append, and appending to something
 * invisible is a silent write.
 */
async function resolveNoteSubject(
  tx: Tx,
  input: {
    recipeSlug?: string | null;
    ingredientSlug?: string | null;
    experimentSlug?: string | null;
    revisionNumber?: number | null;
  },
): Promise<NoteSubject> {
  const subject: NoteSubject = {};

  if (input.recipeSlug) {
    const found = await tx
      .select({
        id: recipes.id,
        title: recipes.title,
        deletedAt: recipes.deletedAt,
      })
      .from(recipes)
      .where(eq(recipes.slug, input.recipeSlug))
      .limit(1);
    if (!found[0]) throw new NotFoundError(`No recipe "${input.recipeSlug}".`);
    if (found[0].deletedAt) {
      throw new ConflictError(
        deletedRefusal(`${found[0].title} (${input.recipeSlug})`),
      );
    }

    if (input.revisionNumber != null) {
      const rev = await tx
        .select({
          id: recipeRevisions.id,
          deletedAt: recipeRevisions.deletedAt,
        })
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
      if (rev[0].deletedAt) {
        throw new ConflictError(
          deletedRefusal(`${found[0].title}, revision ${input.revisionNumber}`),
        );
      }
      subject.revisionId = rev[0].id;
    } else {
      subject.recipeId = found[0].id;
    }
  } else if (input.ingredientSlug) {
    const found = await tx
      .select({
        id: ingredients.id,
        name: ingredients.name,
        deletedAt: ingredients.deletedAt,
      })
      .from(ingredients)
      .where(eq(ingredients.slug, input.ingredientSlug))
      .limit(1);
    if (!found[0]) {
      throw new NotFoundError(`No ingredient "${input.ingredientSlug}".`);
    }
    if (found[0].deletedAt) {
      throw new ConflictError(
        deletedRefusal(`${found[0].name} (${input.ingredientSlug})`),
      );
    }
    subject.ingredientId = found[0].id;
  } else if (input.experimentSlug) {
    const found = await tx
      .select({
        id: experiments.id,
        title: experiments.title,
        deletedAt: experiments.deletedAt,
      })
      .from(experiments)
      .where(eq(experiments.slug, input.experimentSlug))
      .limit(1);
    if (!found[0]) {
      throw new NotFoundError(`No experiment "${input.experimentSlug}".`);
    }
    if (found[0].deletedAt) {
      throw new ConflictError(
        deletedRefusal(`${found[0].title} (${input.experimentSlug})`),
      );
    }
    subject.experimentId = found[0].id;
  }

  return subject;
}

export async function addNote(
  input: AddNoteInput,
): Promise<{ noteId: string }> {
  return withTransaction(async (tx) => {
    const subject: Parameters<typeof writeNotes>[1] = {};

    // A note appends to a record, so it REFUSES a deleted one rather than
    // restoring it: writing a note onto an invisible recipe would report
    // success and show the caller nothing. `resolveNoteSubject` is where each
    // of the four lookups makes that test.
    Object.assign(subject, await resolveNoteSubject(tx, input));

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
 * That promise is now LOCAL TO THIS TOOL. `update_revision` can replace a
 * figure, because a figure that was typed wrong is a record that is wrong
 * and correcting one is a different act from recording another batch. The
 * ergonomic path for filling an empty field on a stored revision is still
 * here, and the refusal says which tool answers which question.
 *
 * It exists because no other path could reach the archive when it was
 * written. `pnpm ingest` skips a recipe that exists and `--force` adds
 * revisions; a revise makes a new version, and a version whose only change
 * is a diagram breaks "every revision records why it exists" and moves a
 * number that is in URLs and in the keys that remember ticked ingredients.
 */
export async function addMassFlow(
  input: AddMassFlowInput,
): Promise<{ slug: string; revisionNumber: number; massFlowId: string }> {
  return withTransaction(async (tx) => {
    const found = await tx
      .select({
        id: recipes.id,
        title: recipes.title,
        currentRevisionId: recipes.currentRevisionId,
        deletedAt: recipes.deletedAt,
      })
      .from(recipes)
      .where(eq(recipes.slug, input.slug))
      .limit(1);
    if (!found[0]) throw new NotFoundError(`No recipe "${input.slug}".`);
    if (found[0].deletedAt) {
      throw new ConflictError(
        deletedRefusal(`${found[0].title} (${input.slug})`),
      );
    }

    let revisionId = found[0].currentRevisionId;
    let revisionNumber: number;

    if (input.revisionNumber != null) {
      const rev = await tx
        .select({
          id: recipeRevisions.id,
          deletedAt: recipeRevisions.deletedAt,
        })
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
      if (rev[0].deletedAt) {
        throw new ConflictError(
          deletedRefusal(`${found[0].title}, revision ${input.revisionNumber}`),
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
 * existed. This fills a field that has never held a value, so it can only
 * turn absent into present. A note whose conditions are already written is
 * refused, and the error says what is there — and now also which tool
 * corrects them, because `update_note` can and this one still cannot. The
 * two answers are different on purpose: a `correction` note leaves the old
 * claim readable, and an update says the old claim was never true.
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
        body: notes.body,
        conditions: notes.conditions,
        deletedAt: notes.deletedAt,
      })
      .from(notes)
      .where(eq(notes.id, input.noteId))
      .limit(1)
      .for('update');
    const note = found[0];
    if (!note) throw new NotFoundError(`No note with id "${input.noteId}".`);
    if (note.deletedAt) {
      throw new ConflictError(
        deletedRefusal(noteHandle(note.kind, note.title, note.body)),
      );
    }

    if (note.conditions.length > 0) {
      throw new ConflictError(
        `That note already states its conditions: ` +
          `${note.conditions.join(' · ')}. This tool does not replace them. ` +
          'To correct them, call update_note. To leave the old claim ' +
          'readable, add a note of kind "correction" that says so.',
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
        'That note states its conditions already. This tool does not ' +
          'replace them. To correct them, call update_note. To leave the ' +
          'old claim readable, add a note of kind "correction" that says so.',
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
  /**
   * True when this call brought a deleted tag back. An upsert states what
   * the record should be, so it restores rather than refuses — and it says
   * so, because a caller that gets `created: false` for a tag it could not
   * see anywhere has been told nothing at all.
   */
  restored: boolean;
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
            deletedAt: taxonomyTerms.deletedAt,
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
        // The upsert rule restores the row this call ADDRESSES. A parent is
        // a row it points at, and pointing at a deleted one would store a
        // hierarchy that reads as `parent: null` on every screen.
        if (parent[0].deletedAt) {
          throw new ConflictError(
            deletedRefusal(
              `${input.categoryType}/${parent[0].slug} — ${parent[0].label}`,
            ),
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
      .select({
        id: taxonomyTerms.id,
        parentId: taxonomyTerms.parentId,
        deletedAt: taxonomyTerms.deletedAt,
      })
      .from(taxonomyTerms)
      .where(
        and(
          eq(taxonomyTerms.facet, input.categoryType),
          eq(taxonomyTerms.slug, slug),
        ),
      )
      .limit(1);

    if (existing[0]) {
      // Restore, not refuse: `upsert_category` says what the tag should be,
      // and `uq_taxonomy_facet_slug` means there is no second row to write
      // instead. Everything the delete took with it comes back too, so the
      // result is the same state a `restore_record` would have produced.
      const restored = existing[0].deletedAt != null;
      if (restored) await restoreTermRow(tx, existing[0].id);
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
        restored,
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
      restored: false,
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
): Promise<{ slug: string; created: boolean; restored: boolean }> {
  return withTransaction(async (tx) => {
    const slug = input.slug ?? slugify(input.name);
    const existing = await tx
      .select({ id: ingredients.id, deletedAt: ingredients.deletedAt })
      .from(ingredients)
      .where(eq(ingredients.slug, slug))
      .limit(1);

    // Restore, not refuse. The slug is unique, so there is no second row to
    // write instead, and naming an ingredient in an upsert is a statement
    // that the ingredient exists. The result says so: a caller that got
    // `created: false` for a row it could not see anywhere was told nothing.
    const restored = existing[0]?.deletedAt != null;
    if (restored) await restoreIngredientRow(tx, existing[0]!.id);

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
        .select({
          slug: ingredients.slug,
          name: ingredients.name,
          deletedAt: ingredients.deletedAt,
        })
        .from(ingredients)
        .where(eq(ingredients.id, nameOwnerId))
        .limit(1);
      throw new ConflictError(
        `The name "${input.name}" already resolves to "${owner[0]?.name}" ` +
          `(${owner[0]?.slug}). Two ingredients cannot answer to the same ` +
          'name: a recipe line naming it would bind to one of them without ' +
          `saying which. Send slug: "${owner[0]?.slug}" to change that ` +
          'ingredient, or pick a name that no ingredient answers to.' +
          // A deleted ingredient still owns its name — the slug is unique
          // whatever the row's state — so the collision is real and the
          // caller needs to be told why it cannot see the thing it hit.
          (owner[0]?.deletedAt
            ? ` That ingredient is deleted. Sending slug: "${owner[0]?.slug}"` +
              ' brings it back.'
            : ''),
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

    return { slug, created: !existing[0], restored };
  });
}

export async function logExperiment(input: LogExperimentInput): Promise<{
  slug: string;
  itemCount: number;
  observationCount: number;
  /** True when this call brought a deleted run back. See below. */
  restored: boolean;
}> {
  return withTransaction(async (tx) => {
    // Every slug, deleted runs included, for the reason `createRecipe` gives:
    // a deleted run still holds `/batch-logs/<slug>`, so a generated slug
    // must not take a name that a restore would need back.
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
        title: experiments.title,
        recipeId: experiments.recipeId,
        revisionId: experiments.revisionId,
        deletedAt: experiments.deletedAt,
        deletedEventId: experiments.deletedEventId,
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
          title: recipes.title,
          currentRevisionId: recipes.currentRevisionId,
          deletedAt: recipes.deletedAt,
        })
        .from(recipes)
        .where(eq(recipes.slug, input.recipeSlug))
        .limit(1);
      if (!found[0])
        throw new NotFoundError(`No recipe "${input.recipeSlug}".`);
      // The run is the record this upsert addresses; the recipe is a row it
      // points at. Linking a run to a deleted recipe would put a line on
      // /batch-logs whose link 404s.
      if (found[0].deletedAt) {
        throw new ConflictError(
          deletedRefusal(`${found[0].title} (${input.recipeSlug})`),
        );
      }
      recipeId = found[0].id;

      if (input.revisionNumber != null) {
        const rev = await tx
          .select({
            id: recipeRevisions.id,
            deletedAt: recipeRevisions.deletedAt,
          })
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
        // Deliberately pinning a NEW run to a withdrawn version is different
        // from a stored run whose version was withdrawn afterwards. The
        // second is the case soft delete exists for and reads as
        // "third revision · withdrawn"; the first is a caller naming a row it
        // cannot see, and is refused.
        //
        // NAMING THE PIN THE RUN ALREADY HOLDS IS NEITHER. It moves nothing,
        // and the state it asks for is the state on disk — which is why
        // `pnpm ingest --force` hit this: every seed re-logs its run with the
        // revision number it was stored with, so one withdrawn version made
        // the whole load abort after a partial write.
        if (rev[0].deletedAt && rev[0].id !== existing[0]?.revisionId) {
          throw new ConflictError(
            deletedRefusal(
              `${found[0].title}, revision ${input.revisionNumber}`,
            ),
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

    /**
     * A re-log of a DELETED run brings it back, and the two links it will
     * hold after this call are what the restore rule is tested against — not
     * the ones it was stored with. That is what lets the escape hatch in
     * `restoreBlockedBy`'s message work: `log_experiment` with
     * `recipeSlug: null` unlinks the run and restores it in one call, so a
     * run whose recipe is still deleted is never stuck.
     *
     * A run cascaded away with its recipe cannot get through here: its recipe
     * is deleted, and either the caller re-points the run at a live recipe or
     * the check below refuses and names the recipe to restore first.
     */
    const restored = existing[0]?.deletedAt != null;
    if (restored && existing[0]) {
      const effectiveRecipeId =
        recipeId !== undefined ? recipeId : existing[0].recipeId;
      const effectiveRevisionId =
        recipeId !== undefined ? (revisionId ?? null) : existing[0].revisionId;
      const record: ResolvedRecord = {
        kind: 'experiment',
        id: existing[0].id,
        address: { kind: 'experiment', id: existing[0].id, slug },
        handle: `${existing[0].title} (${slug})`,
        deletedAt: existing[0].deletedAt,
        deletedEventId: existing[0].deletedEventId,
        recipeId: effectiveRecipeId,
        revisionId: effectiveRevisionId,
        subject: null,
      };
      const blocked = await restoreBlockedBy(tx, record);
      if (blocked) throw new ConflictError(blocked);
      await restoreExperimentRow(tx, record.id, record.deletedEventId);
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
        restored,
      };
    }

    return { slug, itemCount: itemIdByLabel.size, observationCount, restored };
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Correcting a stored record
//
// DID THE FOOD CHANGE, OR IS THE RECORD WRONG? That one question separates
// these three functions from `reviseRecipe`, and it is the sentence every
// tool description that touches them repeats. A dish that changed gets a
// version: `revise_recipe`, a rationale, the old version kept. A record that
// is wrong gets a correction: no new version, no number moved, and NO
// RATIONALE — a rationale is the record of why the dish changed, and a
// correction is the statement that it did not.
//
// The case that made them exist is neither: two chats writing the same
// revision twice. A duplicate is not a version, it is a data-entry accident,
// and a rule that preserves it is protecting a mistake.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Correct the record of a recipe. Touches no version and makes none.
 *
 * Returns `WriteResult` and goes through the same `collectNeedsDescription`
 * as `create_recipe`, because it can mint tags: `categories` replaces the
 * whole list and `resolveTermId` creates what it names. A caller that adds a
 * tag here owes the same description it would owe there, and reusing the
 * machinery means the follow-up text cannot drift.
 */
export async function updateRecipe(
  input: UpdateRecipeInput,
): Promise<WriteResult> {
  return withTransaction(async (tx) => {
    const found = await tx
      .select({
        id: recipes.id,
        title: recipes.title,
        currentRevisionId: recipes.currentRevisionId,
        deletedAt: recipes.deletedAt,
      })
      .from(recipes)
      .where(eq(recipes.slug, input.slug))
      .limit(1);
    const recipe = found[0];
    if (!recipe) {
      throw new NotFoundError(`No recipe with slug "${input.slug}".`);
    }
    if (recipe.deletedAt) {
      throw new ConflictError(
        deletedRefusal(`${recipe.title} (${input.slug})`),
      );
    }

    /**
     * Moving the pointer is the main reason this tool carries a revision
     * number. A restore deliberately does not move it back — restoring a
     * version returns it to the history, and what people read is a separate
     * decision — so this is where that decision gets stated.
     */
    let currentRevisionId = recipe.currentRevisionId;
    if (input.currentRevisionNumber != null) {
      const rev = await tx
        .select({
          id: recipeRevisions.id,
          deletedAt: recipeRevisions.deletedAt,
        })
        .from(recipeRevisions)
        .where(
          and(
            eq(recipeRevisions.recipeId, recipe.id),
            eq(recipeRevisions.revisionNumber, input.currentRevisionNumber),
          ),
        )
        .limit(1);
      if (!rev[0]) {
        throw new NotFoundError(
          `Recipe "${input.slug}" has no revision ${input.currentRevisionNumber}.`,
        );
      }
      // The invariant in `src/db/schema.ts`: `current_revision_id` always
      // names a LIVE revision. Pointing it at a deleted one would make the
      // recipe 404 while still being listed.
      if (rev[0].deletedAt) {
        throw new ConflictError(
          deletedRefusal(
            `${recipe.title}, revision ${input.currentRevisionNumber}`,
          ),
        );
      }
      currentRevisionId = rev[0].id;
    }

    if (!currentRevisionId) {
      throw new ConflictError(
        `Recipe "${input.slug}" has no version yet, so there is nothing to ` +
          'correct. Add one with revise_recipe.',
      );
    }

    await applyTaxonomy(tx, recipe.id, input.categories);
    const unresolvedLinks = input.links
      ? await applyLinks(tx, recipe.id, input.links)
      : [];

    /**
     * THE SAME CHECK, AGAIN, UNDER THE RECIPE ROW'S LOCK — and it is the
     * check that counts. The one above ran unlocked and is check-then-act
     * across two rows: a concurrent `delete_record` of the very revision
     * named here stamps it, finds the pointer naming something else, leaves
     * the pointer alone, and this call then moves the pointer onto the
     * revision that delete just removed. It is the pointer race of
     * `deleteRecord`'s revision branch arriving from the other side, and it
     * needs the same answer.
     *
     * The lock is taken HERE rather than at the top of the function, so the
     * recipe row stays the last row this transaction locks — the order
     * `THE LOCK ORDER` sets out, and the order the `UPDATE` below has always
     * used anyway. The revision is read again, not locked: holding the recipe
     * row is enough, because a delete of one of its revisions has to reach
     * this same row before it can decide anything about the pointer.
     */
    if (input.currentRevisionNumber != null) {
      await tx
        .select({ id: recipes.id })
        .from(recipes)
        .where(eq(recipes.id, recipe.id))
        .limit(1)
        .for('update', { of: recipes });
      const still = await tx
        .select({ deletedAt: recipeRevisions.deletedAt })
        .from(recipeRevisions)
        .where(eq(recipeRevisions.id, currentRevisionId))
        .limit(1);
      if (still[0]?.deletedAt) {
        throw new ConflictError(
          deletedRefusal(
            `${recipe.title}, revision ${input.currentRevisionNumber}`,
          ),
        );
      }
    }

    // Only the keys the caller sent. A `??` fallback here would make an
    // omission indistinguishable from an explicit clear, and this object is
    // handed whole to `.set()` — the rule `upsertIngredient` states.
    await tx
      .update(recipes)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.subtitle !== undefined
          ? { subtitle: input.subtitle ?? null }
          : {}),
        ...(input.summary !== undefined
          ? { summary: input.summary ?? null }
          : {}),
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.originNote !== undefined
          ? { originNote: input.originNote ?? null }
          : {}),
        ...(input.heroImageUrl !== undefined
          ? { heroImageUrl: input.heroImageUrl ?? null }
          : {}),
        ...(input.heroImageAlt !== undefined
          ? { heroImageAlt: input.heroImageAlt ?? null }
          : {}),
        ...(input.currentRevisionNumber != null ? { currentRevisionId } : {}),
        updatedAt: new Date(),
      })
      .where(eq(recipes.id, recipe.id));

    const number = await tx
      .select({ revisionNumber: recipeRevisions.revisionNumber })
      .from(recipeRevisions)
      .where(eq(recipeRevisions.id, currentRevisionId))
      .limit(1);

    return {
      slug: input.slug,
      revisionNumber: number[0]!.revisionNumber,
      recipeId: recipe.id,
      revisionId: currentRevisionId,
      unresolvedLinks,
      needsDescription: await collectNeedsDescription(
        tx,
        recipe.id,
        currentRevisionId,
      ),
    };
  });
}

/**
 * Correct a version that is already stored, in place.
 *
 * It mirrors `reviseRecipe`'s carry-forward logic against ITSELF rather than
 * against a previous revision: an omitted list is read back out of this
 * revision, cross-checked, and written again. That is what keeps the step →
 * ingredient-line links correct when only one of the two lists is replaced,
 * and `checkCarriedUses` runs with exactly the same two hints for exactly the
 * same reason — skipping it would re-open the 400 g/40 g binding defect
 * inside a new tool.
 *
 * NOTES ON STEPS SURVIVE THE REWRITE, and they need help to. A step is a
 * child: it has no delete of its own, and replacing the list means deleting
 * the rows. `notes.step_id` is `ON DELETE CASCADE`, so a straight
 * delete-and-rewrite would HARD delete every note attached to a step of this
 * revision — silently, with no stamp and no restore. So the notes are parked
 * on the revision first, and put back on the step that takes the same
 * position afterwards. A note whose position no longer exists stays on the
 * version, which is the honest degradation: the note survives, attached to
 * the thing it was written about.
 */
export async function updateRevision(
  input: UpdateRevisionInput,
): Promise<WriteResult> {
  return withTransaction(async (tx) => {
    const recipeRows = await tx
      .select({
        id: recipes.id,
        title: recipes.title,
        deletedAt: recipes.deletedAt,
      })
      .from(recipes)
      .where(eq(recipes.slug, input.slug))
      .limit(1);
    const recipe = recipeRows[0];
    if (!recipe) {
      throw new NotFoundError(`No recipe with slug "${input.slug}".`);
    }
    if (recipe.deletedAt) {
      throw new ConflictError(
        deletedRefusal(`${recipe.title} (${input.slug})`),
      );
    }

    const revisionRows = await tx
      .select({
        id: recipeRevisions.id,
        deletedAt: recipeRevisions.deletedAt,
      })
      .from(recipeRevisions)
      .where(
        and(
          eq(recipeRevisions.recipeId, recipe.id),
          eq(recipeRevisions.revisionNumber, input.revisionNumber),
        ),
      )
      .limit(1);
    const revision = revisionRows[0];
    if (!revision) {
      throw new NotFoundError(
        `Recipe "${input.slug}" has no revision ${input.revisionNumber}.`,
      );
    }
    if (revision.deletedAt) {
      throw new ConflictError(
        deletedRefusal(`${recipe.title}, revision ${input.revisionNumber}`),
      );
    }
    const revisionId = revision.id;

    // BOTH lists are read before anything is deleted. Reading the carried
    // half afterwards would read the half this call is in the middle of
    // replacing.
    const replacesBody =
      input.ingredients !== undefined || input.steps !== undefined;
    if (replacesBody) {
      const ingredientLines =
        input.ingredients ?? (await copyIngredientLines(tx, revisionId));
      const stepList = input.steps ?? (await copySteps(tx, revisionId));

      if (input.steps && !input.ingredients) {
        await checkCarriedUses(tx, ingredientLines, stepList, {
          match: 'byName',
          missing:
            "which is not in this version's ingredient list. Send " +
            '`ingredients` alongside `steps` to change both.',
          ambiguous:
            'Send `ingredients` alongside `steps` to give a line the new ' +
            'spelling.',
          qualifier:
            'Send `ingredients` alongside `steps` to give a line that ' +
            'component.',
        });
      } else if (input.ingredients && !input.steps) {
        await checkCarriedUses(tx, ingredientLines, stepList, {
          match: 'byIngredient',
          ambiguous:
            'Send `steps` alongside `ingredients` to say which line each ' +
            'step means.',
        });
      }

      // Park the step notes. `notes.step_id` cascades on delete, and the
      // step rows are about to go.
      const stepNotes = await tx
        .select({ noteId: notes.id, position: recipeSteps.position })
        .from(notes)
        .innerJoin(recipeSteps, eq(recipeSteps.id, notes.stepId))
        .where(eq(recipeSteps.revisionId, revisionId));
      if (stepNotes.length > 0) {
        await tx
          .update(notes)
          .set({ stepId: null, revisionId })
          .where(
            inArray(
              notes.id,
              stepNotes.map((row) => row.noteId),
            ),
          );
      }

      // `recipe_step_ingredients` goes with the steps by FK cascade, and the
      // search vector looks after itself: the trigger on `recipe_ingredients`
      // refreshes the recipe whose CURRENT revision this is, and correctly
      // does nothing when it is not.
      await tx
        .delete(recipeIngredients)
        .where(eq(recipeIngredients.revisionId, revisionId));
      await tx
        .delete(recipeSteps)
        .where(eq(recipeSteps.revisionId, revisionId));
      await writeRevisionBody(tx, revisionId, ingredientLines, stepList);

      if (stepNotes.length > 0) {
        const rewritten = await tx
          .select({ id: recipeSteps.id, position: recipeSteps.position })
          .from(recipeSteps)
          .where(eq(recipeSteps.revisionId, revisionId));
        const stepIdAt = new Map(
          rewritten.map((step) => [step.position, step.id]),
        );
        for (const note of stepNotes) {
          const stepId = stepIdAt.get(note.position);
          // No step at that position any more: the list got shorter. The
          // note stays on the version rather than being thrown away.
          if (!stepId) continue;
          await tx
            .update(notes)
            .set({ stepId, revisionId: null })
            .where(eq(notes.id, note.noteId));
        }
      }
    }

    // `undefined` leaves the figure alone; an explicit `null` removes it.
    if (input.massFlow !== undefined) {
      await replaceMassFlow(tx, revisionId, input.massFlow ?? null);
    }

    await tx
      .update(recipeRevisions)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.summary !== undefined
          ? { summary: input.summary ?? null }
          : {}),
        ...(input.rationale !== undefined
          ? { rationale: input.rationale ?? null }
          : {}),
        ...(input.yieldQuantity !== undefined
          ? { yieldQuantity: num(input.yieldQuantity) }
          : {}),
        ...(input.yieldUnit !== undefined
          ? { yieldUnit: input.yieldUnit ?? null }
          : {}),
        ...(input.servings !== undefined
          ? { servings: input.servings ?? null }
          : {}),
        ...(input.totalTimeMinutes !== undefined
          ? { totalTimeMinutes: input.totalTimeMinutes ?? null }
          : {}),
        ...(input.activeTimeMinutes !== undefined
          ? { activeTimeMinutes: input.activeTimeMinutes ?? null }
          : {}),
        ...(input.occurredAt !== undefined
          ? {
              occurredAt: input.occurredAt ? new Date(input.occurredAt) : null,
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(recipeRevisions.id, revisionId));

    // The record of this recipe changed, and the sitemap and every
    // "newest first" list order by this column.
    await tx
      .update(recipes)
      .set({ updatedAt: new Date() })
      .where(eq(recipes.id, recipe.id));

    return {
      slug: input.slug,
      revisionNumber: input.revisionNumber,
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

/**
 * Correct a note that is already stored.
 *
 * `conditions` is writable here and fill-once in `describe_mechanism`, and
 * both are right: that tool records a mechanism's conditions for the first
 * time and must not be able to replace a measurement quietly, while this one
 * is the statement that what is stored was never true. The other answer — a
 * note of kind `correction` — is still there and still different: it leaves
 * the old claim readable.
 */
export async function updateNote(
  input: UpdateNoteInput,
): Promise<{ noteId: string }> {
  return withTransaction(async (tx) => {
    const found = await tx
      .select({
        id: notes.id,
        kind: notes.kind,
        title: notes.title,
        body: notes.body,
        deletedAt: notes.deletedAt,
      })
      .from(notes)
      .where(eq(notes.id, input.noteId))
      .limit(1);
    const note = found[0];
    if (!note) throw new NotFoundError(`No note with id "${input.noteId}".`);
    if (note.deletedAt) {
      throw new ConflictError(
        deletedRefusal(noteHandle(note.kind, note.title, note.body)),
      );
    }

    /**
     * A research note without a source is not research, and the rule cannot
     * live at the parse boundary here: the schema sees the fields this call
     * sends, and whether the note ends up with a source depends on what is
     * already stored. So it is checked against the state this call will
     * leave behind.
     */
    const kind = input.kind ?? note.kind;
    if (kind === 'research') {
      const sourceCount =
        input.sources !== undefined
          ? input.sources.length
          : (
              await tx
                .select({ id: noteSources.id })
                .from(noteSources)
                .where(eq(noteSources.noteId, note.id))
            ).length;
      if (sourceCount === 0) {
        throw new ConflictError(
          'A research note must cite at least one source in `sources` — ' +
            'give a url, or a title and citation. Research is the kind that ' +
            'records where something came from; without that it is an ' +
            '`observation` or an `idea`, which take no sources.',
        );
      }
    }

    /**
     * Moving the note rewrites ALL FIVE subject columns, because
     * `note_has_exactly_one_subject` is a check constraint: leaving the old
     * one set beside the new one is a database error rather than a sentence
     * the caller can act on. The position is recomputed for the new subject,
     * since it is an ordinal within one parent and the old one means nothing
     * under the new one.
     */
    const movesSubject = Boolean(
      input.recipeSlug || input.ingredientSlug || input.experimentSlug,
    );
    let move: Record<string, unknown> = {};
    if (movesSubject) {
      const subject = await resolveNoteSubject(tx, input);
      move = {
        recipeId: subject.recipeId ?? null,
        revisionId: subject.revisionId ?? null,
        stepId: null,
        ingredientId: subject.ingredientId ?? null,
        experimentId: subject.experimentId ?? null,
        position: await nextNotePosition(tx, subject),
      };
    }

    if (input.sources !== undefined) {
      await tx.delete(noteSources).where(eq(noteSources.noteId, note.id));
      let position = 1;
      for (const source of input.sources) {
        await tx.insert(noteSources).values({
          noteId: note.id,
          url: source.url ?? null,
          title: source.title ?? null,
          citation: source.citation ?? null,
          accessedAt: source.accessedAt ?? null,
          position: position++,
        });
      }
    }

    await tx
      .update(notes)
      .set({
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.title !== undefined ? { title: input.title ?? null } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.conditions !== undefined
          ? { conditions: input.conditions }
          : {}),
        ...move,
        updatedAt: new Date(),
      })
      .where(eq(notes.id, note.id));

    return { noteId: note.id };
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Delete and restore
//
// A delete is soft and it is called delete. The row stays, it stops being
// visible, and `restoreRecord` brings it back. `src/db/schema.ts` holds the
// four columns and the reasoning; what follows is the mechanism.
//
// THE CASCADE IS WRITTEN DOWN THE TREE, not inferred by joining a read back
// up it. Two facts decide that. `experiments.recipe_id` is nullable BY
// DESIGN — a run may name no recipe, and `/batch-logs` prints "Not linked to
// a recipe" for one — so under a join-upward rule a run whose recipe was
// deleted and a run that never named one are the same row, and there is
// nothing to join to. And the four hardest reads in `read.ts` would each
// grow a filter: `getRecipeBySlug`'s note read is `recipe_id = X OR
// revision_id = Y`, `noteRecipeId` is a four-way COALESCE of correlated
// subqueries, and `noteBelongsToRecipe` states the same rule turned round
// with a comment saying the two must move together. Four places to forget
// instead of two. The write cost is bounded and one-off: a recipe has a
// handful of revisions, tens of notes and a few runs, so it is six UPDATEs
// in one transaction.
//
// EVERY UPDATE CARRIES `deleted_at IS NULL`, the root's included. That
// single predicate is what makes the child-deleted-first case need no
// bookkeeping: a row that was already deleted is skipped and keeps its own
// stamp, its own date and its own reason, so restoring the parent's event
// leaves it exactly where it was and `restore_record` on the child itself is
// what brings it back.
//
// THE ROOT ALSO TAKES `FOR UPDATE`, and the predicate alone was not enough.
// Two connectors deleting one record under READ COMMITTED both read it live
// and both write. The cascade was already safe — the loser's UPDATEs matched
// nothing — but the root's was not: the loser's event id overwrote the
// winner's on the root while the children kept the winner's, and a restore
// clears by the ROOT's id, so it brought back the root alone and left a live
// recipe whose `current_revision_id` named a deleted revision. See
// `SEE_DELETED_LOCKED`.
// ─────────────────────────────────────────────────────────────────────────

/** How a caller names one record. The legal forms are in `schemas.ts`. */
export interface RecordAddress {
  kind: DeletableKind;
  id?: string;
  slug?: string;
  revisionNumber?: number;
  categoryType?: CategoryType;
}

export interface DeleteResult {
  kind: DeletableKind;
  id: string;
  handle: string;
  deletedAt: string;
  eventId: string;
  /** What went with it. The root is named above and is not counted here. */
  cascaded: { kind: DeletableKind; count: number }[];
}

export interface RestoreResult {
  kind: DeletableKind;
  id: string;
  handle: string;
  /** What came back with it. The root is named above and is not counted. */
  restored: { kind: DeletableKind; count: number }[];
}

/** One record, found by its address, with what the rules below need. */
interface ResolvedRecord {
  kind: DeletableKind;
  id: string;
  /** One line a person recognises. */
  handle: string;
  /** The same row, written the way `restore_record` takes it. */
  address: Required<Pick<RecordAddress, 'kind' | 'id'>> & RecordAddress;
  deletedAt: Date | null;
  deletedEventId: string | null;
  /** The recipe a revision belongs to, or the one a run names. */
  recipeId: string | null;
  /** The revision a run is pinned to. */
  revisionId: string | null;
  /** A note's five subject columns, so its parent can be found. */
  subject: {
    recipeId: string | null;
    revisionId: string | null;
    stepId: string | null;
    ingredientId: string | null;
    experimentId: string | null;
  } | null;
}

/** A note's handle: its kind, then its title or the start of its body. */
function noteHandle(kind: string, title: string | null, body: string): string {
  const text = title?.trim() || body.trim().replace(/\s+/g, ' ').slice(0, 80);
  return `${kind}: ${text}`;
}

/** What the caller wrote, for a message that says which address missed. */
function addressText(address: RecordAddress): string {
  if (address.id) return `id "${address.id}"`;
  if (address.kind === 'revision') {
    return `"${address.slug}" revision ${address.revisionNumber}`;
  }
  if (address.kind === 'tag') {
    return `"${address.slug}" in the "${address.categoryType}" category`;
  }
  return `"${address.slug}"`;
}

/** Read the row whatever state it is in. Every delete and restore path does. */
const SEE_DELETED = { allowDeleted: true } as const;

/**
 * The same, and hold the row until the transaction ends.
 *
 * `deleteRecord` and `restoreRecord` are check-then-act: they read the row,
 * decide from its `deleted_at`, and then write. `withTransaction` runs at the
 * pool default, READ COMMITTED, so two connectors deleting one record both
 * read it live, both pass the guard, and both write — and this connector is
 * multi-client by design. The cascade survived that (every cascade UPDATE
 * carries `deleted_at IS NULL`, so the loser stamped nothing) but the root
 * did not: the loser's event id landed on the root while the winner's stayed
 * on the children, and `restore_record` then cleared the root alone and left
 * a live recipe pointing at a deleted revision.
 *
 * `FOR UPDATE` is the same answer `describeMechanism` takes for the same
 * shape, and `docs/mcp-connector.md` states the reasoning. `of` names the
 * addressed table only: the revision read joins `recipes` for the handle, and
 * locking a recipe row here — BEFORE the revision — would put this call on
 * the opposite side of the lock order every other writer in this file uses.
 * See `THE LOCK ORDER` below for what that order is and why the revision
 * branch of `deleteRecord` takes the recipe row second rather than first.
 */
const SEE_DELETED_LOCKED = { allowDeleted: true, lock: true } as const;

/**
 * THE LOCK ORDER, stated once, because two writers taking two rows in
 * opposite orders is a deadlock and a deadlock in a delete is worse than
 * anything it would be fixing: Postgres kills one transaction after
 * `deadlock_timeout` and the caller is told "An internal error occurred".
 *
 * **`recipes` is locked LAST.** Every writer that touches both a recipe and
 * something below it reaches the recipe row at the end:
 *
 * | Writer                      | Order                                        |
 * | --------------------------- | -------------------------------------------- |
 * | `createRecipe`              | new rows only                                |
 * | `reviseRecipe`              | ingredients, terms → new revision → recipes  |
 * | `updateRevision`            | ingredients → revision → recipes             |
 * | `updateRecipe`              | terms, links → recipes                       |
 * | `deleteRecord` (ingredient) | ingredients → notes → recipes (search vector)|
 * | `deleteRecord` (tag)        | terms → recipes (search vector)              |
 * | `deleteRecord` (revision)   | revision → recipes                           |
 *
 * `deleteRecord` and `restoreRecord` addressing a RECIPE are the one
 * exception and cannot be anything else: the recipe is the row they address,
 * so `resolveAddress` locks it first and the cascade reaches the revisions
 * after. That leaves exactly one pair in the wrong order — a recipe delete
 * against a revision delete of the same recipe — and `lockRecipeTree` below
 * is what makes that pair impossible rather than merely unlikely.
 *
 * Any integer identifies the namespace; it only has to be one this database
 * does not use for something else.
 */
const RECIPE_TREE_LOCK = 8317;

/**
 * Hold one recipe's whole tree for the rest of this transaction.
 *
 * It is a MUTEX, not a row lock, and that is the point: it is taken as the
 * FIRST statement of the transaction, before any row lock at all. A
 * transaction can therefore never be holding a row somebody else wants while
 * it waits here, so this lock cannot be one edge of a cycle — which is what
 * lets `deleteRecord` address a recipe (recipes first, revisions after) and a
 * revision (revision first, recipes after) without the two orders ever
 * meeting. They do not run at the same time on one recipe.
 *
 * `pg_advisory_xact_lock` is released when the transaction ends, commit or
 * rollback, so it is safe behind a connection pool in a way the session-scoped
 * form is not. `hashtext` collapses the uuid to an `int4`; a collision costs
 * two unrelated recipes a moment of waiting and nothing else.
 */
async function lockRecipeTree(tx: Tx, recipeId: string): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(${RECIPE_TREE_LOCK}, hashtext(${recipeId}))`,
  );
}

/**
 * The recipe a delete or a restore is about to reach into, found WITHOUT a
 * lock so that `lockRecipeTree` really is the first lock taken.
 *
 * Reading it unlocked is safe because neither answer can change under us:
 * `recipes.id` is the primary key and `recipe_revisions.recipe_id` is never
 * updated — a revision cannot move to another recipe. Nothing is deleted for
 * real either, so a row that is there stays there.
 *
 * Returns null for the four kinds that are not part of a recipe's tree, and
 * for an address that names nothing — `resolveAddress` raises the proper
 * `NotFoundError` a moment later, with the message the caller needs.
 */
async function recipeTreeOf(
  tx: Tx,
  address: RecordAddress,
): Promise<string | null> {
  if (address.kind === 'recipe') {
    const rows = await tx
      .select({ id: recipes.id })
      .from(recipes)
      .where(
        address.id
          ? eq(recipes.id, address.id)
          : eq(recipes.slug, address.slug!),
      )
      .limit(1);
    return rows[0]?.id ?? null;
  }
  if (address.kind === 'revision') {
    const rows = await tx
      .select({ id: recipeRevisions.recipeId })
      .from(recipeRevisions)
      .innerJoin(recipes, eq(recipes.id, recipeRevisions.recipeId))
      .where(
        address.id
          ? eq(recipeRevisions.id, address.id)
          : and(
              eq(recipes.slug, address.slug!),
              eq(recipeRevisions.revisionNumber, address.revisionNumber!),
            ),
      )
      .limit(1);
    return rows[0]?.id ?? null;
  }
  return null;
}

/**
 * Turn an address into a row. THE ONE PLACE the address table in
 * `schemas.ts` §8 is enforced at run time, so `delete_record`,
 * `restore_record` and anything added later cannot disagree about what
 * `{ kind: 'tag', slug: 'braising' }` means.
 *
 * It reads the BASE tables, not the `_live` views, because both callers need
 * to see deleted rows — one to refuse a second delete, the other to restore.
 * `allowDeleted: false` is for a caller that wants the row only if it is
 * live, and it refuses with the shared sentence.
 */
async function resolveAddress(
  tx: Tx,
  address: RecordAddress,
  options: { allowDeleted: boolean; lock?: boolean },
): Promise<ResolvedRecord> {
  /**
   * Whether each read below ends in `FOR UPDATE OF <the addressed table>`.
   * See `SEE_DELETED_LOCKED`: a caller that is about to write the row asks
   * for it; a caller that only wants to read the row's state does not.
   */
  const lock = options.lock === true;

  const missing = () =>
    new NotFoundError(`No ${address.kind} at ${addressText(address)}.`);
  const base = {
    recipeId: null,
    revisionId: null,
    subject: null,
  } as const;

  let record: ResolvedRecord;

  switch (address.kind) {
    case 'recipe': {
      const read = tx
        .select({
          id: recipes.id,
          slug: recipes.slug,
          title: recipes.title,
          deletedAt: recipes.deletedAt,
          deletedEventId: recipes.deletedEventId,
        })
        .from(recipes)
        .where(
          address.id
            ? eq(recipes.id, address.id)
            : eq(recipes.slug, address.slug!),
        )
        .limit(1);
      const rows = await (lock ? read.for('update', { of: recipes }) : read);
      const row = rows[0];
      if (!row) throw missing();
      record = {
        ...base,
        kind: 'recipe',
        id: row.id,
        address: { kind: 'recipe', id: row.id, slug: row.slug },
        handle: `${row.title} (${row.slug})`,
        deletedAt: row.deletedAt,
        deletedEventId: row.deletedEventId,
      };
      break;
    }
    case 'revision': {
      const read = tx
        .select({
          id: recipeRevisions.id,
          number: recipeRevisions.revisionNumber,
          deletedAt: recipeRevisions.deletedAt,
          deletedEventId: recipeRevisions.deletedEventId,
          recipeId: recipes.id,
          recipeSlug: recipes.slug,
          recipeTitle: recipes.title,
        })
        .from(recipeRevisions)
        .innerJoin(recipes, eq(recipes.id, recipeRevisions.recipeId))
        .where(
          address.id
            ? eq(recipeRevisions.id, address.id)
            : and(
                eq(recipes.slug, address.slug!),
                eq(recipeRevisions.revisionNumber, address.revisionNumber!),
              ),
        )
        .limit(1);
      const rows = await (lock
        ? read.for('update', { of: recipeRevisions })
        : read);
      const row = rows[0];
      if (!row) throw missing();
      record = {
        ...base,
        kind: 'revision',
        id: row.id,
        address: {
          kind: 'revision',
          id: row.id,
          slug: row.recipeSlug,
          revisionNumber: row.number,
        },
        handle: `${row.recipeTitle}, revision ${row.number}`,
        deletedAt: row.deletedAt,
        deletedEventId: row.deletedEventId,
        recipeId: row.recipeId,
      };
      break;
    }
    case 'note': {
      const read = tx
        .select({
          id: notes.id,
          kind: notes.kind,
          title: notes.title,
          body: notes.body,
          deletedAt: notes.deletedAt,
          deletedEventId: notes.deletedEventId,
          recipeId: notes.recipeId,
          revisionId: notes.revisionId,
          stepId: notes.stepId,
          ingredientId: notes.ingredientId,
          experimentId: notes.experimentId,
        })
        .from(notes)
        .where(eq(notes.id, address.id!))
        .limit(1);
      const rows = await (lock ? read.for('update', { of: notes }) : read);
      const row = rows[0];
      if (!row) throw missing();
      record = {
        kind: 'note',
        id: row.id,
        address: { kind: 'note', id: row.id },
        handle: noteHandle(row.kind, row.title, row.body),
        deletedAt: row.deletedAt,
        deletedEventId: row.deletedEventId,
        recipeId: null,
        revisionId: null,
        subject: {
          recipeId: row.recipeId,
          revisionId: row.revisionId,
          stepId: row.stepId,
          ingredientId: row.ingredientId,
          experimentId: row.experimentId,
        },
      };
      break;
    }
    case 'experiment': {
      const read = tx
        .select({
          id: experiments.id,
          slug: experiments.slug,
          title: experiments.title,
          recipeId: experiments.recipeId,
          revisionId: experiments.revisionId,
          deletedAt: experiments.deletedAt,
          deletedEventId: experiments.deletedEventId,
        })
        .from(experiments)
        .where(
          address.id
            ? eq(experiments.id, address.id)
            : eq(experiments.slug, address.slug!),
        )
        .limit(1);
      const rows = await (lock
        ? read.for('update', { of: experiments })
        : read);
      const row = rows[0];
      if (!row) throw missing();
      record = {
        ...base,
        kind: 'experiment',
        id: row.id,
        address: { kind: 'experiment', id: row.id, slug: row.slug },
        handle: `${row.title} (${row.slug})`,
        deletedAt: row.deletedAt,
        deletedEventId: row.deletedEventId,
        recipeId: row.recipeId,
        revisionId: row.revisionId,
      };
      break;
    }
    case 'ingredient': {
      const read = tx
        .select({
          id: ingredients.id,
          slug: ingredients.slug,
          name: ingredients.name,
          deletedAt: ingredients.deletedAt,
          deletedEventId: ingredients.deletedEventId,
        })
        .from(ingredients)
        .where(
          address.id
            ? eq(ingredients.id, address.id)
            : eq(ingredients.slug, address.slug!),
        )
        .limit(1);
      const rows = await (lock
        ? read.for('update', { of: ingredients })
        : read);
      const row = rows[0];
      if (!row) throw missing();
      record = {
        ...base,
        kind: 'ingredient',
        id: row.id,
        address: { kind: 'ingredient', id: row.id, slug: row.slug },
        handle: `${row.name} (${row.slug})`,
        deletedAt: row.deletedAt,
        deletedEventId: row.deletedEventId,
      };
      break;
    }
    case 'tag': {
      const read = tx
        .select({
          id: taxonomyTerms.id,
          facet: taxonomyTerms.facet,
          slug: taxonomyTerms.slug,
          label: taxonomyTerms.label,
          deletedAt: taxonomyTerms.deletedAt,
          deletedEventId: taxonomyTerms.deletedEventId,
        })
        .from(taxonomyTerms)
        .where(
          address.id
            ? eq(taxonomyTerms.id, address.id)
            : and(
                eq(taxonomyTerms.facet, address.categoryType!),
                eq(taxonomyTerms.slug, address.slug!),
              ),
        )
        .limit(1);
      const rows = await (lock
        ? read.for('update', { of: taxonomyTerms })
        : read);
      const row = rows[0];
      if (!row) throw missing();
      record = {
        ...base,
        kind: 'tag',
        id: row.id,
        address: {
          kind: 'tag',
          id: row.id,
          slug: row.slug,
          categoryType: row.facet,
        },
        handle: `${row.facet}/${row.slug} — ${row.label}`,
        deletedAt: row.deletedAt,
        deletedEventId: row.deletedEventId,
      };
      break;
    }
  }

  if (record.deletedAt && !options.allowDeleted) {
    throw new ConflictError(deletedRefusal(record.handle));
  }
  return record;
}

/** `restore_record` written out, so a refusal can say exactly what to send. */
function restoreCall(address: RecordAddress): string {
  const parts: string[] = [`kind: "${address.kind}"`];
  if (address.slug) parts.push(`slug: "${address.slug}"`);
  if (address.revisionNumber != null) {
    parts.push(`revisionNumber: ${address.revisionNumber}`);
  }
  if (address.categoryType)
    parts.push(`categoryType: "${address.categoryType}"`);
  if (!address.slug) parts.push(`id: "${address.id}"`);
  return `restore_record { ${parts.join(', ')} }`;
}

/** Count rows by kind, in the order `DELETABLE_KINDS` lists them. */
function tally() {
  const counts = new Map<DeletableKind, number>();
  return {
    add(kind: DeletableKind, n: number) {
      if (n > 0) counts.set(kind, (counts.get(kind) ?? 0) + n);
    },
    /** Take the root back out: it is named beside the list, not inside it. */
    drop(kind: DeletableKind, n: number) {
      const left = (counts.get(kind) ?? 0) - n;
      if (left > 0) counts.set(kind, left);
      else counts.delete(kind);
    },
    list(): { kind: DeletableKind; count: number }[] {
      return DELETABLE_KINDS.filter((kind) => counts.has(kind)).map((kind) => ({
        kind,
        count: counts.get(kind)!,
      }));
    },
  };
}

/**
 * Refresh the stored search vector of every recipe that carries this tag.
 *
 * NOT OPTIONAL, and the census in `e2e/data-deleted.spec.ts` cannot catch it.
 * `recipes.search_vector` is a column: drizzle/0001_search_indexes.sql folds
 * tag labels into weight B, and the triggers that maintain it fire on
 * `recipe_terms`, not on the tag row. So without this a deleted tag's label
 * stays in the index of every recipe it was on and `search_recipes` keeps
 * matching a word that is nowhere on the site — nothing is *displayed*, which
 * is exactly why a display census misses it. Migration 0007 teaches
 * `recipe_search_vector` to skip deleted tags; this is what makes it re-run.
 * The mirror runs on restore.
 */
async function refreshSearchForTerm(tx: Tx, termId: string): Promise<void> {
  await tx.execute(
    sql`SELECT refresh_recipe_search_vector(recipe_id)
          FROM recipe_terms
         WHERE term_id = ${termId}`,
  );
}

/**
 * The same, one table over: ingredient names are weight D, and only for the
 * revision a recipe currently points at. DISTINCT because a recipe may name
 * one ingredient on several lines and the function need only run once.
 */
async function refreshSearchForIngredient(
  tx: Tx,
  ingredientId: string,
): Promise<void> {
  await tx.execute(
    sql`SELECT refresh_recipe_search_vector(id)
          FROM (
            SELECT DISTINCT r.id
              FROM recipes r
              JOIN recipe_ingredients ri ON ri.revision_id = r.current_revision_id
             WHERE ri.ingredient_id = ${ingredientId}
          ) AS affected`,
  );
}

/**
 * Clear the delete stamp from every row carrying `eventId`, across the six
 * tables that have one. Returns what came back, by kind.
 *
 * This is the whole of a restore, and it is why the child-deleted-first case
 * needs no bookkeeping: the set is exactly the rows one delete call stamped,
 * because every UPDATE in that call carried `deleted_at IS NULL` and skipped
 * anything that was already gone.
 */
async function clearDeleteEvent(
  tx: Tx,
  eventId: string,
): Promise<ReturnType<typeof tally>> {
  const back = tally();
  const tables = [
    ['recipe', recipes],
    ['revision', recipeRevisions],
    ['note', notes],
    ['experiment', experiments],
    ['ingredient', ingredients],
    ['tag', taxonomyTerms],
  ] as const;
  for (const [kind, table] of tables) {
    const rows = await tx
      .update(table)
      .set(LIVE)
      .where(eq(table.deletedEventId, eventId))
      .returning({ id: table.id });
    back.add(kind, rows.length);
  }
  return back;
}

/**
 * Bring one row back, with whatever went with it.
 *
 * A row with no `deleted_event_id` is one somebody stamped by hand — nothing
 * in this file writes `deleted_at` without an event — so it is restored on
 * its own rather than guessed at.
 */
async function clearDeleteStamp(
  tx: Tx,
  record: ResolvedRecord,
): Promise<ReturnType<typeof tally>> {
  if (record.deletedEventId) {
    return clearDeleteEvent(tx, record.deletedEventId);
  }
  const back = tally();
  const single = {
    recipe: () => tx.update(recipes).set(LIVE).where(eq(recipes.id, record.id)),
    revision: () =>
      tx
        .update(recipeRevisions)
        .set(LIVE)
        .where(eq(recipeRevisions.id, record.id)),
    note: () => tx.update(notes).set(LIVE).where(eq(notes.id, record.id)),
    experiment: () =>
      tx.update(experiments).set(LIVE).where(eq(experiments.id, record.id)),
    ingredient: () =>
      tx.update(ingredients).set(LIVE).where(eq(ingredients.id, record.id)),
    tag: () =>
      tx.update(taxonomyTerms).set(LIVE).where(eq(taxonomyTerms.id, record.id)),
  } as const;
  await single[record.kind]();
  back.add(record.kind, 1);
  return back;
}

/**
 * THE RESTORE RULE, stated once and uniform:
 *
 *   A restore is refused when the record the row belongs to is still
 *   deleted. The refusal names what to restore first.
 *
 * This is what lets a restore never need to know the tree. A cascaded child's
 * parent is always deleted in the same event, so addressing the child is
 * refused and the message points at the parent; and a root's parent is always
 * live, so clearing by event id is exactly the right set.
 *
 * Returns the refusal, or null when the restore may go ahead.
 */
async function restoreBlockedBy(
  tx: Tx,
  record: ResolvedRecord,
): Promise<string | null> {
  const blocker = async (
    kind: DeletableKind,
    id: string | null,
  ): Promise<ResolvedRecord | null> => {
    if (!id) return null;
    const parent = await resolveAddress(tx, { kind, id }, SEE_DELETED);
    return parent.deletedAt ? parent : null;
  };
  const refusal = (parent: ResolvedRecord, extra = '') =>
    `${record.handle} belongs to ${parent.handle}, which is deleted. ` +
    `Restore that first: ${restoreCall(parent.address)}.${extra}`;

  switch (record.kind) {
    // No parent. A recipe, an ingredient and a tag stand on their own.
    case 'recipe':
    case 'ingredient':
    case 'tag':
      return null;

    case 'revision': {
      const parent = await blocker('recipe', record.recipeId);
      return parent ? refusal(parent) : null;
    }

    case 'note': {
      const subject = record.subject!;
      // The step case reaches one level further: a step carries no delete
      // flag of its own — its lifetime is its revision's — so the record a
      // step note belongs to is the revision the step is in.
      if (subject.stepId) {
        const rows = await tx
          .select({ revisionId: recipeSteps.revisionId })
          .from(recipeSteps)
          .where(eq(recipeSteps.id, subject.stepId))
          .limit(1);
        const parent = await blocker('revision', rows[0]?.revisionId ?? null);
        return parent ? refusal(parent) : null;
      }
      for (const [kind, id] of [
        ['recipe', subject.recipeId],
        ['revision', subject.revisionId],
        ['ingredient', subject.ingredientId],
        ['experiment', subject.experimentId],
      ] as const) {
        const parent = await blocker(kind, id);
        if (parent) return refusal(parent);
      }
      return null;
    }

    case 'experiment': {
      // Both links are optional — `experiments.recipe_id` is nullable by
      // design, because a run may name no recipe at all. The escape hatch is
      // named in the refusal: a run can be unlinked rather than wait.
      const extra =
        ' Or call log_experiment with recipeSlug: null to unlink the run ' +
        'first.';
      for (const [kind, id] of [
        ['recipe', record.recipeId],
        ['revision', record.revisionId],
      ] as const) {
        const parent = await blocker(kind, id);
        if (parent) return refusal(parent, extra);
      }
      return null;
    }
  }
}

/**
 * Restore ONE RUN and the notes that went with it, and nothing else.
 *
 * `log_experiment` is the only caller, and it cannot use `clearDeleteStamp`.
 * A run reaches a deleted state two ways: deleted on its own, where it is the
 * root of its event and clearing the event would be right; or CASCADED AWAY
 * WITH ITS RECIPE, where the event also stamps the recipe, every revision and
 * every other note — and clearing it would bring a whole recipe back because
 * somebody re-logged one batch. That second case is reachable: the restore
 * rule lets a run through whenever this call re-points it at a live recipe or
 * unlinks it, which is exactly the escape hatch the refusal advertises.
 *
 * Scoping to the run and its own notes is identical to clearing the event in
 * the first case — that event holds nothing else — and is the only correct
 * answer in the second.
 */
async function restoreExperimentRow(
  tx: Tx,
  id: string,
  eventId: string | null,
): Promise<void> {
  await tx.update(experiments).set(LIVE).where(eq(experiments.id, id));
  if (!eventId) return;
  await tx
    .update(notes)
    .set(LIVE)
    .where(and(eq(notes.experimentId, id), eq(notes.deletedEventId, eventId)));
}

/** Restore one ingredient row and everything its delete took with it. */
async function restoreIngredientRow(tx: Tx, id: string): Promise<void> {
  const record = await resolveAddress(
    tx,
    { kind: 'ingredient', id },
    SEE_DELETED,
  );
  if (!record.deletedAt) return;
  await clearDeleteStamp(tx, record);
  await refreshSearchForIngredient(tx, id);
}

/** The same for a tag. */
async function restoreTermRow(tx: Tx, id: string): Promise<void> {
  const record = await resolveAddress(tx, { kind: 'tag', id }, SEE_DELETED);
  if (!record.deletedAt) return;
  await clearDeleteStamp(tx, record);
  await refreshSearchForTerm(tx, id);
}

/**
 * Delete one record. The row stays; it stops being visible.
 *
 * `actor` is the new thing the write layer learns. Nothing here has ever
 * known who was calling — `createRecipe(input, source)` takes an enum and
 * nothing more — but the bin has to print a name beside a date and a reason,
 * and `mcp_audit_log` is the wrong place to read it from: that write is
 * fire-and-forget, nothing reads the table, it records tool CALLS rather than
 * row state, and `pnpm ingest` reaches this layer with no principal at all.
 * So it is passed in explicitly and stored, and it is nullable.
 */
export async function deleteRecord(
  address: RecordAddress,
  options: { reason?: string | null; actor?: string | null } = {},
): Promise<DeleteResult> {
  return withTransaction(async (tx) => {
    // First statement, before any row lock. See `lockRecipeTree`.
    const tree = await recipeTreeOf(tx, address);
    if (tree) await lockRecipeTree(tx, tree);

    const target = await resolveAddress(tx, address, SEE_DELETED_LOCKED);
    if (target.deletedAt) {
      throw new ConflictError(
        `${target.handle} is deleted already, on ` +
          `${target.deletedAt.toISOString().slice(0, 10)}. Call list_deleted ` +
          `to see the bin, or ${restoreCall(target.address)} to bring it back.`,
      );
    }

    const reason = options.reason?.trim();
    const stamp: DeleteStamp = {
      deletedAt: new Date(),
      deletedBy: options.actor ?? null,
      deletedReason: reason ? reason : null,
      deletedEventId: crypto.randomUUID(),
    };
    const went = tally();

    /** Stamp the live notes whose `column` is one of `ids`. */
    const stampNotes = async (
      column:
        | typeof notes.recipeId
        | typeof notes.revisionId
        | typeof notes.stepId
        | typeof notes.ingredientId
        | typeof notes.experimentId,
      ids: string[],
    ) => {
      if (ids.length === 0) return;
      const rows = await tx
        .update(notes)
        .set(stamp)
        .where(and(isNull(notes.deletedAt), inArray(column, ids)))
        .returning({ id: notes.id });
      went.add('note', rows.length);
    };

    /**
     * Stamp the ROOT, and make the section comment above true.
     *
     * Every cascade UPDATE carried `deleted_at IS NULL` from the start; the
     * six root UPDATEs did not, and that one gap is what let two concurrent
     * deletes of one record both succeed. The winner stamped the children
     * with its event, the loser then overwrote the root with its own, and
     * `restore_record` — which clears by the ROOT's event id — brought back
     * the root alone. `FOR UPDATE` in `resolveAddress` now serialises the
     * pair, so this predicate can only fail if a row was deleted by some
     * path that does not take that lock. It is the backstop, not the fix,
     * and it refuses rather than reports a delete that wrote nothing.
     */
    const stampRoot = async (written: { id: string }[]) => {
      if (written.length === 0) {
        throw new ConflictError(
          `${target.handle} was deleted by another call while this one ran. ` +
            `Call list_deleted to see the bin, or ` +
            `${restoreCall(target.address)} to bring it back.`,
        );
      }
    };

    /** The live revisions of a recipe, and the steps they hold. */
    const liveRevisionIds = async (recipeId: string) =>
      (
        await tx
          .select({ id: recipeRevisions.id })
          .from(recipeRevisions)
          .where(
            and(
              eq(recipeRevisions.recipeId, recipeId),
              isNull(recipeRevisions.deletedAt),
            ),
          )
      ).map((row) => row.id);

    const stepIdsOf = async (revisionIds: string[]) =>
      revisionIds.length === 0
        ? []
        : (
            await tx
              .select({ id: recipeSteps.id })
              .from(recipeSteps)
              .where(inArray(recipeSteps.revisionId, revisionIds))
          ).map((row) => row.id);

    switch (target.kind) {
      case 'recipe': {
        const recipeId = target.id;
        // Children first, so every subquery still sees the rows it names.
        //
        // BATCH LOGS GO WITH THE RECIPE. A run is its own record with its own
        // page, and leaving it would put a row on /batch-logs linking to a
        // 404. The alternative — nulling `experiments.recipe_id` — is a
        // destructive edit that cannot be undone and leaves the run saying
        // "Not linked to a recipe" forever, which is a lie about the run.
        // Cascading is reversible and stamped; an agent that wants the run
        // without the recipe restores the run and re-points it with
        // log_experiment.
        const runIds = (
          await tx
            .select({ id: experiments.id })
            .from(experiments)
            .where(
              and(
                eq(experiments.recipeId, recipeId),
                isNull(experiments.deletedAt),
              ),
            )
        ).map((row) => row.id);
        await stampNotes(notes.experimentId, runIds);
        went.add(
          'experiment',
          (
            await tx
              .update(experiments)
              .set(stamp)
              .where(
                and(
                  isNull(experiments.deletedAt),
                  eq(experiments.recipeId, recipeId),
                ),
              )
              .returning({ id: experiments.id })
          ).length,
        );

        const revisionIds = await liveRevisionIds(recipeId);
        await stampNotes(notes.stepId, await stepIdsOf(revisionIds));
        await stampNotes(notes.revisionId, revisionIds);
        await stampNotes(notes.recipeId, [recipeId]);
        went.add(
          'revision',
          (
            await tx
              .update(recipeRevisions)
              .set(stamp)
              .where(
                and(
                  isNull(recipeRevisions.deletedAt),
                  eq(recipeRevisions.recipeId, recipeId),
                ),
              )
              .returning({ id: recipeRevisions.id })
          ).length,
        );
        await stampRoot(
          await tx
            .update(recipes)
            .set(stamp)
            .where(and(isNull(recipes.deletedAt), eq(recipes.id, recipeId)))
            .returning({ id: recipes.id }),
        );
        break;
      }

      case 'revision': {
        const recipeId = target.recipeId!;

        /**
         * THE POINTER IS READ UNDER THE RECIPE ROW'S OWN LOCK, and both the
         * read and the write below are decided on what this read returns.
         *
         * Unlocked, this was a check-then-act across two rows and it lost.
         * Two calls deleting two DIFFERENT revisions of one recipe both read
         * the pointer before either committed: A deleted the revision the
         * pointer named and moved it onto B's target; B, holding the value it
         * read before A ran, saw a pointer that did not name its own target
         * and left it alone. Both committed and `current_revision_id` named a
         * deleted revision — the one invariant `src/db/schema.ts` states about
         * this column. The recipe still drew, because `getRecipeBySlug` falls
         * back to the newest live revision, but the page foot lost its
         * effectivity line, `update_recipe` reported a deleted revision number
         * as a success, and `reviseRecipe` carried the deleted revision's
         * ingredients and steps forward into a new LIVE one. Deleted content
         * was public again and nobody had called `restore_record`.
         *
         * `FOR UPDATE` makes the second caller wait here. READ COMMITTED then
         * gives every statement after it a fresh snapshot, so the pointer, the
         * survivor list and the "only version" refusal below are all computed
         * from what the first caller actually committed. Nothing can move the
         * pointer between this read and the write at the end of the branch: a
         * pointer write needs at least an exclusive lock on this row, and this
         * transaction holds it until it commits.
         *
         * ON THE ORDER: the revision was locked first, this recipe row
         * second, which is the order every other writer in this file uses —
         * see `THE LOCK ORDER`. The one writer that takes them the other way
         * round is a delete or a restore addressing the RECIPE, and
         * `lockRecipeTree` at the top of both functions means that call and
         * this one are never in flight on the same recipe at the same time.
         */
        const recipeRows = await tx
          .select({
            slug: recipes.slug,
            currentRevisionId: recipes.currentRevisionId,
          })
          .from(recipes)
          .where(eq(recipes.id, recipeId))
          .limit(1)
          .for('update', { of: recipes });
        const recipe = recipeRows[0]!;

        /**
         * The newest surviving version, by the order the history is already
         * listed in. NOT `MAX(revision_number)`: a backfilled version carries
         * a later number and an earlier date, so pointing at the highest
         * number makes a recipe read as its own oldest version.
         *
         * Read after the lock above, so a sibling revision another call has
         * just deleted is already excluded rather than chosen.
         */
        const survivors = await tx
          .select({ id: recipeRevisions.id })
          .from(recipeRevisions)
          .where(
            and(
              eq(recipeRevisions.recipeId, recipeId),
              isNull(recipeRevisions.deletedAt),
              ne(recipeRevisions.id, target.id),
            ),
          )
          .orderBy(
            desc(
              sql`COALESCE(${recipeRevisions.occurredAt}, ${recipeRevisions.createdAt})`,
            ),
            desc(recipeRevisions.revisionNumber),
          )
          .limit(1);

        if (!survivors[0]) {
          throw new ConflictError(
            `This is the only version of "${recipe.slug}". A recipe with no ` +
              'version cannot be read. Delete the recipe instead.',
          );
        }

        await stampNotes(notes.stepId, await stepIdsOf([target.id]));
        await stampNotes(notes.revisionId, [target.id]);
        await stampRoot(
          await tx
            .update(recipeRevisions)
            .set(stamp)
            .where(
              and(
                isNull(recipeRevisions.deletedAt),
                eq(recipeRevisions.id, target.id),
              ),
            )
            .returning({ id: recipeRevisions.id }),
        );

        // Runs pinned to this version are deliberately NOT touched: the run
        // happened. `experiments.revision_id` still points at a row that
        // still exists, so the run keeps its number and reads "withdrawn".
        if (recipe.currentRevisionId === target.id) {
          await tx
            .update(recipes)
            .set({ currentRevisionId: survivors[0].id, updatedAt: new Date() })
            .where(eq(recipes.id, recipeId));
        }
        break;
      }

      case 'experiment': {
        await stampNotes(notes.experimentId, [target.id]);
        await stampRoot(
          await tx
            .update(experiments)
            .set(stamp)
            .where(
              and(isNull(experiments.deletedAt), eq(experiments.id, target.id)),
            )
            .returning({ id: experiments.id }),
        );
        break;
      }

      case 'ingredient': {
        await stampNotes(notes.ingredientId, [target.id]);
        await stampRoot(
          await tx
            .update(ingredients)
            .set(stamp)
            .where(
              and(isNull(ingredients.deletedAt), eq(ingredients.id, target.id)),
            )
            .returning({ id: ingredients.id }),
        );
        await refreshSearchForIngredient(tx, target.id);
        break;
      }

      case 'tag': {
        await stampRoot(
          await tx
            .update(taxonomyTerms)
            .set(stamp)
            .where(
              and(
                isNull(taxonomyTerms.deletedAt),
                eq(taxonomyTerms.id, target.id),
              ),
            )
            .returning({ id: taxonomyTerms.id }),
        );
        await refreshSearchForTerm(tx, target.id);
        break;
      }

      case 'note': {
        await stampRoot(
          await tx
            .update(notes)
            .set(stamp)
            .where(and(isNull(notes.deletedAt), eq(notes.id, target.id)))
            .returning({ id: notes.id }),
        );
        break;
      }
    }

    return {
      kind: target.kind,
      id: target.id,
      handle: target.handle,
      deletedAt: stamp.deletedAt.toISOString(),
      eventId: stamp.deletedEventId,
      cascaded: went.list(),
    };
  });
}

/**
 * Bring back a record that is deleted, with the set one delete removed.
 *
 * It does NOT move the current revision pointer back. Restoring a version
 * returns it to the history; it does not decide what people read, and
 * `update_recipe { currentRevisionNumber: n }` is the explicit way to say
 * that. It also does not bring back a record that somebody deleted on its own
 * before this one — that row carries its own stamp and needs its own restore.
 *
 * `actor` is accepted so the call site matches `deleteRecord` and is not
 * stored. There is no `restored_by` column: nothing displays one, so the
 * audit log is enough, which is exactly the argument `deleted_by` fails.
 */
export async function restoreRecord(
  address: RecordAddress,
  _options: { actor?: string | null } = {},
): Promise<RestoreResult> {
  return withTransaction(async (tx) => {
    // First statement, before any row lock, and for the same reason the
    // delete takes it: a restore of a recipe clears the revisions with it.
    const tree = await recipeTreeOf(tx, address);
    if (tree) await lockRecipeTree(tx, tree);

    const target = await resolveAddress(tx, address, SEE_DELETED_LOCKED);
    if (!target.deletedAt) {
      throw new ConflictError(
        `${target.handle} is not deleted, so there is nothing to restore.`,
      );
    }

    const blocked = await restoreBlockedBy(tx, target);
    if (blocked) throw new ConflictError(blocked);

    const back = await clearDeleteStamp(tx, target);
    back.drop(target.kind, 1);

    // The mirror of the two refreshes a delete runs. A tag's label and an
    // ingredient's name are folded into `recipes.search_vector`, and nothing
    // fires when the tag row or the ingredient row changes.
    if (target.kind === 'tag') await refreshSearchForTerm(tx, target.id);
    if (target.kind === 'ingredient') {
      await refreshSearchForIngredient(tx, target.id);
    }

    return {
      kind: target.kind,
      id: target.id,
      handle: target.handle,
      restored: back.list(),
    };
  });
}
