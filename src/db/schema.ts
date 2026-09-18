/**
 * Noble Notations — database schema.
 *
 * The repository models four systems the site is built around, plus the
 * plumbing that lets an MCP client write into them:
 *
 *   1. Taxonomy   — faceted, hierarchical terms (cuisine, technique, diet…)
 *                   that every recipe is classified against.
 *   2. Ingredients — a canonical ingredient list, separate from the
 *                   per-recipe lines that reference it. This is what makes
 *                   "which recipes use tofu as a sauce base" answerable.
 *   3. Process    — ordered, phased steps carrying duration, temperature and
 *                   equipment, each able to name the ingredients it consumes.
 *   4. Notes      — typed annotations (observation, research, substitution…)
 *                   attachable to a recipe, a revision, a step or an
 *                   ingredient, with citable sources.
 *
 * The organising principle is REVISIONS. A recipe is a stable identity with a
 * slug and a title; its ingredients and steps belong to a `recipe_revisions`
 * row. Refining a recipe APPENDS a revision and moves the pointer. That is
 * the whole point of the rebuild: the same dish gets better over time instead
 * of being re-derived from scratch on every conversation.
 *
 * Append-only is not the same as immutable, and this schema states the
 * difference in two places rather than one. A dish that CHANGED gets a new
 * revision. A revision that was written down WRONG gets corrected in place —
 * `update_recipe`, `update_revision`, `update_note` — which makes no version
 * and moves no number. A record that should never have been written gets
 * DELETED, softly: see `softDelete` below, which is where the four columns
 * that carry that are defined and argued for.
 */
import { isNull, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  customType,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  pgView,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  bigint,
  serial,
} from 'drizzle-orm/pg-core';

/**
 * Postgres `tsvector`. The value is maintained entirely by the triggers in
 * drizzle/0001_search_indexes.sql — application code only ever reads it, and
 * only inside a `@@` match, so a string representation is enough here.
 */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType: () => 'tsvector',
});

const now = () =>
  timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const touched = () =>
  timestamp('updated_at', { withTimezone: true }).defaultNow().notNull();

/**
 * The four columns a DELETE writes, on the seven tables that carry a record.
 *
 * A delete here is soft: the row stays, it stops being visible, and
 * `restore_record` brings it back. The purpose of this repository is an
 * accurate history, not an immutable one — two chats can write the same
 * revision twice, and a duplicate is a data-entry accident rather than a
 * version, so the model has to be able to take one back out.
 *
 * **`deleted_at`, not `is_deleted`.** A timestamp answers "when", which the
 * bin listing and the restore order both need, and a boolean would want a
 * second column for it. It is also already this schema's vocabulary for "this
 * row stopped counting at a moment": `mcp_access_tokens.revoked_at`,
 * `mcp_auth_codes.consumed_at`.
 *
 * **`deleted_by` is denormalised on purpose, and the audit log is not enough.**
 * `writeMcpAudit` is fire-and-forget and swallows its own failure into a
 * `console.warn`, so a value the bin must display cannot depend on it; nothing
 * reads `mcp_audit_log` and building `list_deleted` over it would mean matching
 * a text blob against live rows; the audit log records tool CALLS while the bin
 * needs row STATE (deleted, restored, deleted again is three audit rows and one
 * truth); and not every write comes through MCP — `pnpm ingest` calls the write
 * layer with no principal at all. Nullable for that last reason.
 *
 * **`deleted_reason` is stored and the tool argument is optional.** A delete is
 * reversible, so a required reason is friction for a small payoff — but the bin
 * prints it, and it is the only thing that tells the next reader why a record
 * went.
 *
 * **`deleted_event_id` is the cascade stamp.** One delete call mints one uuid
 * and writes it to every row it touches, the root included, and every UPDATE
 * carries `AND deleted_at IS NULL` — so a row that was already deleted keeps
 * its own stamp and its own date. A restore clears exactly the rows carrying
 * the addressed row's stamp, which is why a child deleted on its own before its
 * parent stays deleted when the parent comes back. Named `event` and not
 * `cascade` because `ON DELETE CASCADE` already means a hard delete in this
 * schema, and not `batch` because this repository's batches are biltong.
 *
 * **This is not `recipes.status = 'archived'`, and the word "archive" is not
 * used for it anywhere.** `archived` means *readable at its own address, off
 * the index*; `deleted_at` means *not readable anywhere, 404*. The third
 * `archive` — the frozen Markdown under `content/`, served by
 * `src/lib/archive.ts` off disk behind `/archive` — never touches the database.
 * Three meanings is already two too many.
 */
const softDelete = () => ({
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: text('deleted_by'),
  deletedReason: text('deleted_reason'),
  deletedEventId: uuid('deleted_event_id'),
});

// ─────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────

/**
 * Taxonomy facets. A facet is an axis of classification; terms never cross
 * facets, so "Sichuan" (cuisine) and "braising" (technique) can share a slug
 * without colliding.
 */
export const taxonomyFacet = pgEnum('taxonomy_facet', [
  'cuisine',
  'course',
  'technique',
  'diet',
  'season',
  'equipment',
  'occasion',
  'preservation',
  'texture',
  'ingredient_class',
]);

export const recipeStatus = pgEnum('recipe_status', [
  'draft',
  'active',
  'archived',
]);

/**
 * Not everything in here is a dish. A `preparation` is a component another
 * recipe pulls in (demi-glace, a spice dredge); a `process` is a technique
 * with no fixed yield (dry-curing); `research` is a long-form note that has
 * no steps of its own but is citable from recipes that do.
 */
export const recipeKind = pgEnum('recipe_kind', [
  'recipe',
  'preparation',
  'process',
  'research',
]);

export const revisionSource = pgEnum('revision_source', [
  'human',
  'mcp',
  'import',
]);

export const ingredientCategory = pgEnum('ingredient_category', [
  'produce',
  'protein',
  'dairy',
  'grain',
  'legume',
  'spice',
  'herb',
  'condiment',
  'fat',
  'acid',
  'sweetener',
  'alcohol',
  'liquid',
  'fungus',
  'additive',
  'other',
]);

export const ingredientRelationKind = pgEnum('ingredient_relation_kind', [
  'substitute',
  'variety_of',
  'component_of',
]);

/**
 * The editorial edges between two recipes. All five are optional, unordered
 * and many-to-many: a recipe may reference six others and be referenced by
 * ten.
 *
 * **`variant_of` is NOT in this list, and its absence is the point.** It was
 * here until migration 0011 and it was the wrong shape for what it said. The
 * other four are remarks a writer makes about two finished dishes; being a
 * variation is structural — it is at most one parent, it must not form a
 * cycle, it decides what the Variations panel draws and it is what makes two
 * recipes siblings. An edge in a table that `applyLinks` rewrites wholesale
 * could hold none of that, and a caller echoing back the list it was shown
 * would drop the parentage every time. It is `recipes.variant_of_id` now:
 * one column, one parent, one meaning. See that column's comment.
 */
export const recipeLinkKind = pgEnum('recipe_link_kind', [
  'derived_from',
  'component_of',
  'pairs_with',
  'references',
]);

export const noteKind = pgEnum('note_kind', [
  'observation',
  'research',
  /**
   * Why a thing works, mechanically. Distinct from `research`, which had
   * been carrying both "duxelles is a moisture barrier, not a flavour
   * layer" and "where to buy crayfish in Berlin" — sourcing and mechanism
   * are different questions and only one of them belongs under a heading
   * called science.
   */
  'science',
  'substitution',
  'warning',
  'result',
  'idea',
  'correction',
]);

// ─────────────────────────────────────────────────────────────────────────
// 1. Taxonomy
// ─────────────────────────────────────────────────────────────────────────

export const taxonomyTerms = pgTable(
  'taxonomy_terms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    facet: taxonomyFacet('facet').notNull(),
    slug: text('slug').notNull(),
    label: text('label').notNull(),
    description: text('description'),
    /**
     * One picture for the tag's own page. See `images` below for what these
     * two columns hold: an address this site serves, not a blob URL.
     */
    heroImageUrl: text('hero_image_url'),
    heroImageAlt: text('hero_image_alt'),
    /** Self-referential parent for hierarchy, e.g. Sichuan → Chinese. */
    parentId: uuid('parent_id').references(
      (): AnyPgColumn => taxonomyTerms.id,
      {
        onDelete: 'set null',
      },
    ),
    createdAt: now(),
    updatedAt: touched(),
    ...softDelete(),
  },
  (t) => [
    uniqueIndex('uq_taxonomy_facet_slug').on(t.facet, t.slug),
    index('idx_taxonomy_parent').on(t.parentId),
    /**
     * Two partial indexes per soft-deletable table, and partial is what makes
     * them cheap: they cover deleted rows only, which is a handful in a store
     * whose whole point is keeping things. `list_deleted` reads the first and
     * `restore_record` reads the second.
     *
     * There is deliberately no index on the live side. The tables are small
     * and every live read already carries a selective predicate — a slug, a
     * recipe id, a facet — so `deleted_at IS NULL` is a filter on a handful of
     * rows rather than a scan.
     */
    index('idx_taxonomy_terms_deleted')
      .on(t.deletedAt.desc())
      .where(sql`${t.deletedAt} IS NOT NULL`),
    index('idx_taxonomy_terms_deleted_event')
      .on(t.deletedEventId)
      .where(sql`${t.deletedEventId} IS NOT NULL`),
  ],
);

export const recipeTerms = pgTable(
  'recipe_terms',
  {
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    termId: uuid('term_id')
      .notNull()
      .references(() => taxonomyTerms.id, { onDelete: 'cascade' }),
    /** Marks the headline term for its facet — the cuisine shown on a card. */
    isPrimary: boolean('is_primary').default(false).notNull(),
  },
  (t) => [
    uniqueIndex('uq_recipe_terms').on(t.recipeId, t.termId),
    index('idx_recipe_terms_term').on(t.termId),
  ],
);

// ─────────────────────────────────────────────────────────────────────────
// 2. Ingredients
// ─────────────────────────────────────────────────────────────────────────

export const ingredients = pgTable(
  'ingredients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    plural: text('plural'),
    category: ingredientCategory('category').notNull().default('other'),
    description: text('description'),
    /**
     * A picture of the raw ingredient. Two chillies are told apart faster by
     * a photograph than by any description, which is why this exists.
     */
    heroImageUrl: text('hero_image_url'),
    heroImageAlt: text('hero_image_alt'),
    /**
     * Grams per millilitre, where known. Lets a volume measurement in one
     * recipe be compared against a weight in another — the biltong logs are
     * all grams, most Western recipes are cups.
     */
    densityGPerMl: numeric('density_g_per_ml', { precision: 8, scale: 4 }),
    defaultUnit: text('default_unit'),
    /** Alternate names so search finds "coriander" from "cilantro". */
    aliases: text('aliases')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    createdAt: now(),
    updatedAt: touched(),
    ...softDelete(),
  },
  (t) => [
    index('idx_ingredients_category').on(t.category),
    index('idx_ingredients_deleted')
      .on(t.deletedAt.desc())
      .where(sql`${t.deletedAt} IS NOT NULL`),
    index('idx_ingredients_deleted_event')
      .on(t.deletedEventId)
      .where(sql`${t.deletedEventId} IS NOT NULL`),
  ],
);

export const ingredientRelations = pgTable(
  'ingredient_relations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fromIngredientId: uuid('from_ingredient_id')
      .notNull()
      .references(() => ingredients.id, { onDelete: 'cascade' }),
    toIngredientId: uuid('to_ingredient_id')
      .notNull()
      .references(() => ingredients.id, { onDelete: 'cascade' }),
    kind: ingredientRelationKind('kind').notNull(),
    note: text('note'),
    createdAt: now(),
  },
  (t) => [
    uniqueIndex('uq_ingredient_relation').on(
      t.fromIngredientId,
      t.toIngredientId,
      t.kind,
    ),
    check(
      'ingredient_relation_not_self',
      sql`${t.fromIngredientId} <> ${t.toIngredientId}`,
    ),
  ],
);

// ─────────────────────────────────────────────────────────────────────────
// Recipes and revisions
// ─────────────────────────────────────────────────────────────────────────

export const recipes = pgTable(
  'recipes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    subtitle: text('subtitle'),
    summary: text('summary'),
    kind: recipeKind('kind').notNull().default('recipe'),
    status: recipeStatus('status').notNull().default('active'),
    /**
     * Points at the revision the site renders. Nullable only in the window
     * between inserting a recipe and inserting its first revision; every
     * write path closes that window in a transaction.
     *
     * **The invariant, and every child read depends on it: this always names a
     * LIVE revision of a LIVE recipe.** Deleting the current revision of a
     * recipe that has others moves the pointer to the newest survivor by
     * `COALESCE(occurred_at, created_at) DESC, revision_number DESC` — the
     * order the history is already listed in, not `MAX(revision_number)`, for
     * the reason `getRecipeIdentity` gives: a backfilled revision carries a
     * later number and an earlier date. Deleting the ONLY revision is refused
     * and says to delete the recipe instead, because a null pointer would let
     * `listRecipes` print a recipe whose page 404s.
     */
    currentRevisionId: uuid('current_revision_id'),
    /**
     * The recipe this one is a VARIATION of. Null for a base dish, which is
     * the ordinary case.
     *
     * ── WHY THIS IS A COLUMN AND NOT A `recipe_links` ROW ──────────────
     *
     * A variation is not a revision and it is not a remark. Dan dan noodles
     * with shiitake is not a refinement of dan dan noodles — nothing was
     * learned and the older version was not superseded — so it cannot be a
     * revision, which would move `current_revision_id` and take the original
     * off the page. It is a second dish that keeps its own name, its own
     * slug, its own revisions and its own batch logs, and says where it came
     * from.
     *
     * `recipe_links.kind = 'variant_of'` said that sentence and could not
     * hold it. Three things a variation needs and an edge in that table
     * cannot give:
     *
     * 1. **At most one.** A dish varies one dish. Two `variant_of` rows out
     *    of one recipe put it in two families and the panel drew both.
     *    A column has one value; the partial unique index a link table would
     *    have needed is the column itself.
     * 2. **No cycles.** A is a variation of B is a variation of A has no
     *    root, and the recursive walk that draws the family would not
     *    terminate. `assertNoVariantCycle` in `write.ts` refuses it; the
     *    `variant_not_self` check below refuses the one-step case in the
     *    database, where no write path can get around it.
     * 3. **It survives a list rewrite.** `applyLinks` replaces a recipe's
     *    whole link list, and `get_recipe` hides an edge whose target is
     *    deleted — so a caller sending back exactly what it was shown
     *    dropped the parentage silently, and the Variations panel, the
     *    breadcrumb and every sibling went with it. The same shape as the
     *    bug the link tables' own comment records, with more to lose.
     *    `update_recipe` touches this only when it is named.
     *
     * ── WHAT A DELETE DOES TO A FAMILY ────────────────────────────────
     *
     * Nothing, and that is deliberate. The column is not cleared and no
     * child is touched, because a delete here is soft and a restore has to
     * put the family back exactly. What changes is what a READER sees:
     * `variantFamily` walks `recipes_live`, so a deleted recipe is not a
     * node and is not a path — its children become roots of their own
     * families until it is restored, and the branch below them stays
     * attached to them throughout. That is the same answer `recipe_terms`
     * gives for an edge to a deleted tag, for the same reason.
     *
     * `ON DELETE SET NULL` is the hard-delete backstop, matching
     * `taxonomy_terms.parent_id`. No application path hard-deletes a recipe;
     * if one ever does, a child is orphaned rather than destroyed.
     */
    variantOfId: uuid('variant_of_id').references(
      (): AnyPgColumn => recipes.id,
      { onDelete: 'set null' },
    ),
    /**
     * What makes this variation different, in one line: "With shiitake
     * instead of pork", "Vegan". Drawn beside the title in the Variations
     * panel and on the card that marks a variation on the index, so a
     * reader can tell three siblings apart without opening all three.
     *
     * Null when nothing was said, and the panel then draws the title alone.
     * Meaningless without `variant_of_id`, and `variantOfShape` in
     * `schemas.ts` refuses the pair where the note is set and the parent is
     * not — a caller that writes one and forgets the other has almost
     * certainly made a mistake, and a stray line of prose on a base dish is
     * invisible until somebody makes it a variation months later.
     */
    variantNote: text('variant_note'),
    heroImageUrl: text('hero_image_url'),
    heroImageAlt: text('hero_image_alt'),
    /** Where this came from — a cookbook, a conversation, a restaurant. */
    originNote: text('origin_note'),
    /** Weighted full-text index; written by trigger, never by the app. */
    searchVector: tsvector('search_vector'),
    createdAt: now(),
    updatedAt: touched(),
    ...softDelete(),
  },
  (t) => [
    index('idx_recipes_status').on(t.status),
    index('idx_recipes_kind').on(t.kind),
    /**
     * Every variation read starts from a parent id — the family walk
     * descends by it and `listRecipes` marks a card by it — and unlike the
     * deleted indexes below this one covers the LIVE side, because the
     * predicate is the whole query rather than a filter on top of a slug.
     */
    index('idx_recipes_variant_of')
      .on(t.variantOfId)
      .where(sql`${t.variantOfId} IS NOT NULL`),
    /**
     * The one-step cycle, refused where no write path can reach around it.
     * The longer ones are `assertNoVariantCycle`'s job: Postgres has no
     * declarative constraint for "this edge closes a loop", and a trigger
     * doing the walk would fire on every recipe write to catch a case the
     * write layer already has the row locked for.
     */
    check('variant_not_self', sql`${t.variantOfId} <> ${t.id}`),
    index('idx_recipes_deleted')
      .on(t.deletedAt.desc())
      .where(sql`${t.deletedAt} IS NOT NULL`),
    index('idx_recipes_deleted_event')
      .on(t.deletedEventId)
      .where(sql`${t.deletedEventId} IS NOT NULL`),
  ],
);

export const recipeRevisions = pgTable(
  'recipe_revisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    /**
     * 1-based, per recipe, and permanent. Dense until a version is deleted.
     *
     * **A deleted number is retired and is never reissued**, and that is the
     * second thing the *soft* half of a delete buys. `reviseRecipe` takes
     * `MAX(revision_number) + 1` over this table, deleted rows included, so the
     * next version gets a fresh number; a hard delete would free number 3, the
     * next revise would reuse it, and `/recipes/x/revisions/3` — a public URL,
     * and half of the `nn:checked:{slug}:{revision}` key a phone remembers a
     * ticked list under — would quietly start drawing a different version.
     * A deleted 3 answers 404 forever instead, which is the honest answer.
     */
    revisionNumber: integer('revision_number').notNull(),
    title: text('title').notNull(),
    summary: text('summary'),
    /**
     * Why this revision exists. The single most valuable field in the
     * schema: it is the difference between a pile of versions and a record
     * of what was learned.
     */
    rationale: text('rationale'),
    yieldQuantity: numeric('yield_quantity', { precision: 10, scale: 3 }),
    yieldUnit: text('yield_unit'),
    servings: integer('servings'),
    totalTimeMinutes: integer('total_time_minutes'),
    activeTimeMinutes: integer('active_time_minutes'),
    source: revisionSource('source').notNull().default('human'),
    /**
     * When this version of the recipe actually existed, if that is not when
     * the row was written.
     *
     * Revision numbers are dense, 1-based and permanent — they are in URLs
     * and in the localStorage keys that remember ticked ingredients — so an
     * older version discovered later cannot be given a lower number without
     * rewriting what the existing numbers mean. It gets the next number
     * like everything else, and this column says where it belongs in the
     * history.
     *
     * NULL means "when it was written", which is the ordinary case. A value
     * here therefore also marks the revision as one recorded after the
     * fact; history is ordered by COALESCE(occurred_at, created_at).
     */
    occurredAt: timestamp('occurred_at', { withTimezone: true }),
    createdAt: now(),
    /**
     * Every other content table has carried one since the first migration.
     * This table was the exception because a revision was never editable, and
     * `update_revision` is the moment that stopped being true: a version that
     * is corrected in place has a record that changed, and the row has to be
     * able to say so.
     */
    updatedAt: touched(),
    ...softDelete(),
  },
  (t) => [
    uniqueIndex('uq_revision_number').on(t.recipeId, t.revisionNumber),
    index('idx_revisions_recipe').on(t.recipeId),
    check('revision_number_positive', sql`${t.revisionNumber} > 0`),
    index('idx_recipe_revisions_deleted')
      .on(t.deletedAt.desc())
      .where(sql`${t.deletedAt} IS NOT NULL`),
    index('idx_recipe_revisions_deleted_event')
      .on(t.deletedEventId)
      .where(sql`${t.deletedEventId} IS NOT NULL`),
  ],
);

export const recipeLinks = pgTable(
  'recipe_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fromRecipeId: uuid('from_recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    toRecipeId: uuid('to_recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    kind: recipeLinkKind('kind').notNull(),
    note: text('note'),
    createdAt: now(),
  },
  (t) => [
    uniqueIndex('uq_recipe_link').on(t.fromRecipeId, t.toRecipeId, t.kind),
    index('idx_recipe_links_to').on(t.toRecipeId),
    check('recipe_link_not_self', sql`${t.fromRecipeId} <> ${t.toRecipeId}`),
  ],
);

// ─────────────────────────────────────────────────────────────────────────
// 2b. Ingredient lines (belong to a revision, not a recipe)
// ─────────────────────────────────────────────────────────────────────────

export const recipeIngredients = pgTable(
  'recipe_ingredients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    revisionId: uuid('revision_id')
      .notNull()
      .references(() => recipeRevisions.id, { onDelete: 'cascade' }),
    /**
     * Null when the line could not be resolved to a canonical ingredient.
     * `rawText` always holds what was actually written, so an unresolved
     * line still renders correctly and can be reconciled later.
     */
    ingredientId: uuid('ingredient_id').references(() => ingredients.id, {
      onDelete: 'set null',
    }),
    position: integer('position').notNull(),
    /** Sub-list heading: "Wash", "Dredge", "Duxelles". */
    component: text('component'),
    quantity: numeric('quantity', { precision: 12, scale: 4 }),
    /** Upper bound for ranges written as "4–5 chipotle". */
    quantityMax: numeric('quantity_max', { precision: 12, scale: 4 }),
    unit: text('unit'),
    /** "deseeded", "coarsely ground", "halved crosswise". */
    preparation: text('preparation'),
    optional: boolean('optional').default(false).notNull(),
    note: text('note'),
    rawText: text('raw_text').notNull(),
    createdAt: now(),
  },
  (t) => [
    index('idx_recipe_ingredients_revision').on(t.revisionId),
    index('idx_recipe_ingredients_ingredient').on(t.ingredientId),
    uniqueIndex('uq_recipe_ingredient_position').on(t.revisionId, t.position),
  ],
);

// ─────────────────────────────────────────────────────────────────────────
// 3. Process
// ─────────────────────────────────────────────────────────────────────────

export const recipeSteps = pgTable(
  'recipe_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    revisionId: uuid('revision_id')
      .notNull()
      .references(() => recipeRevisions.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    /** Groups steps into stages: "Prep", "Cure", "Hang", "Finish". */
    phase: text('phase'),
    instruction: text('instruction').notNull(),
    durationMinutes: integer('duration_minutes'),
    durationMaxMinutes: integer('duration_max_minutes'),
    temperatureC: numeric('temperature_c', { precision: 6, scale: 2 }),
    equipment: text('equipment')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    /** Links the step to a technique term so "everything I braise" works. */
    techniqueTermId: uuid('technique_term_id').references(
      () => taxonomyTerms.id,
      { onDelete: 'set null' },
    ),
    /**
     * Optional picture of what this stage should look like. Belongs to the
     * step, and therefore to the revision, so a photo taken of batch four
     * does not silently reattach itself to batch six's method.
     */
    imageUrl: text('image_url'),
    imageAlt: text('image_alt'),
    note: text('note'),
    createdAt: now(),
  },
  (t) => [
    index('idx_recipe_steps_revision').on(t.revisionId),
    uniqueIndex('uq_recipe_step_position').on(t.revisionId, t.position),
  ],
);

/**
 * The mass flow figure — one per revision, at most.
 *
 * A cured, dried or reduced dish is planned around what it weighs at each
 * stage, and the schema held exactly one of those numbers: `yield_quantity`,
 * the finished mass. R-SCR-39 draws the whole run — 10 kg raw through
 * 321.7 g of wash to 4.5 kg dried — and calls it a MAY, so a recipe with no
 * figure is a correct rendering and this is optional everywhere.
 *
 * It hangs off the REVISION rather than the recipe, for the reason
 * `recipe_steps.image_url` gives just above: batch five was 8.2 kg and batch
 * six is 10 kg, so a recipe-level figure would draw the sixth revision's
 * masses on `/recipes/baumy-biltong/revisions/3`, which renders through the
 * same component.
 *
 * `UNIQUE (revision_id)` is the append-only guarantee in the database rather
 * than only in the write path: a revision's figure can be written once and
 * never rewritten, so this can turn absent into present and nothing else.
 */
export const recipeMassFlows = pgTable(
  'recipe_mass_flows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    revisionId: uuid('revision_id')
      .notNull()
      .references(() => recipeRevisions.id, { onDelete: 'cascade' }),
    /**
     * The net change across the whole run, as a signed percentage: -55.00
     * for the biltong. Signed because R-SCR-39 says "loses or gains", and
     * dimensionless, so it carries no unit.
     *
     * STORED, never derived. It is not (raw - dried) / raw: the 55 % is of
     * NET weight, while the first stage is a gross mass and the dredge adds
     * about 460 g along the way. Computing it would also mean deciding that
     * the first and last stages share a unit, which is the cross-unit
     * reasoning this repository refuses everywhere else.
     */
    netChangePercent: numeric('net_change_percent', { precision: 6, scale: 2 }),
    /**
     * Percent of the starting weight lost per day. Stored for the same
     * reason and one more: it is a per-piece regression over a run of
     * weighings, and nothing in this table can be used to recompute it.
     */
    ratePercentPerDay: numeric('rate_percent_per_day', {
      precision: 6,
      scale: 2,
    }),
    /** Where the numbers came from. Provenance, not drawn on the screen. */
    note: text('note'),
    createdAt: now(),
  },
  (t) => [uniqueIndex('uq_mass_flow_revision').on(t.revisionId)],
);

/**
 * One stage of the figure — `RAW 10 kg`, `CURE 24–48 h`, `DRIED 4.5 kg`.
 *
 * Rows with a `position` rather than a JSON column on the revision, because
 * every other ordered list in this schema is rows with a position, and
 * because the constraints below are worth having in the database rather
 * than in whichever caller happens to write next.
 */
export const recipeMassFlowStages = pgTable(
  'recipe_mass_flow_stages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    massFlowId: uuid('mass_flow_id')
      .notNull()
      .references(() => recipeMassFlows.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    /** Stored as written; the drawing uppercases it. */
    label: text('label').notNull(),
    quantity: numeric('quantity', { precision: 12, scale: 4 }),
    /** Upper bound for a stage written as a range — "25–30 pieces". */
    quantityMax: numeric('quantity_max', { precision: 12, scale: 4 }),
    unit: text('unit'),
    /**
     * A stage that is a wait rather than a weight, in minutes.
     *
     * Minutes and no unit column, exactly as `recipe_steps` does it. The
     * unit vocabulary in src/lib/domain/units.ts defines no time unit at
     * all, and adding `h` and `d` to it to caption a figure would make
     * "24 h of beef" a legal ingredient line and start bucketing hours into
     * a shopping list. Time has one base unit here.
     */
    durationMinutes: integer('duration_minutes'),
    durationMaxMinutes: integer('duration_max_minutes'),
    /**
     * Drawn with the accent ground and border. Carried rather than inferred
     * from "last": a recipe that GAINS weight — a brine, a soak — makes its
     * point at a different stage.
     */
    emphasis: boolean('emphasis').default(false).notNull(),
    /**
     * What to draw when neither pair can hold the figure — "held under
     * 100 °C". Unlike `recipe_ingredients.raw_text` this is nullable and is
     * NOT a cache of the structured values: a stage that has them draws
     * them, and this is only read when it has neither.
     */
    rawText: text('raw_text'),
    createdAt: now(),
  },
  (t) => [
    index('idx_mass_flow_stages_flow').on(t.massFlowId),
    uniqueIndex('uq_mass_flow_stage_position').on(t.massFlowId, t.position),
    // A stage is one figure: a weight, a count, or a wait. Both at once has
    // no drawing — the design gives each cell a single value line.
    check(
      'mass_flow_stage_single_figure',
      sql`${t.quantity} IS NULL OR ${t.durationMinutes} IS NULL`,
    ),
    // …and it has something to draw. A labelled empty box is a hole in the
    // strip that says nothing.
    check(
      'mass_flow_stage_has_a_figure',
      sql`COALESCE(${t.quantity}, ${t.durationMinutes}) IS NOT NULL
          OR ${t.rawText} IS NOT NULL`,
    ),
    // An upper bound with no lower bound, or one below it, renders as
    // "48–24 h". Refused here rather than tidied up at render time.
    check(
      'mass_flow_stage_quantity_range',
      sql`${t.quantityMax} IS NULL
          OR (${t.quantity} IS NOT NULL AND ${t.quantityMax} >= ${t.quantity})`,
    ),
    check(
      'mass_flow_stage_duration_range',
      sql`${t.durationMaxMinutes} IS NULL
          OR (${t.durationMinutes} IS NOT NULL
              AND ${t.durationMaxMinutes} >= ${t.durationMinutes})`,
    ),
  ],
);

/** Which ingredient lines a given step consumes. */
export const recipeStepIngredients = pgTable(
  'recipe_step_ingredients',
  {
    stepId: uuid('step_id')
      .notNull()
      .references(() => recipeSteps.id, { onDelete: 'cascade' }),
    recipeIngredientId: uuid('recipe_ingredient_id')
      .notNull()
      .references(() => recipeIngredients.id, { onDelete: 'cascade' }),
  },
  (t) => [
    uniqueIndex('uq_step_ingredient').on(t.stepId, t.recipeIngredientId),
    index('idx_step_ingredients_ingredient').on(t.recipeIngredientId),
  ],
);

// ─────────────────────────────────────────────────────────────────────────
// 4. Notes
// ─────────────────────────────────────────────────────────────────────────

export const notes = pgTable(
  'notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: noteKind('kind').notNull(),
    title: text('title'),
    /** Markdown. */
    body: text('body').notNull(),
    /**
     * The conditions a mechanism holds under, as separate values: `232 °C`,
     * `45 min`, `single layer on a rack`. R-SCR-41 requires them separate
     * and forbids writing them into a sentence, and a note held a kind, a
     * title and a body and nothing else — so a mechanism's temperature, its
     * time and its layer depth had nowhere to live. This is D-02.
     *
     * A text array rather than a child table, following
     * `recipe_steps.equipment` and `ingredients.aliases`: nothing joins on
     * these, no screen filters by them, and they refuse to be parsed anyway
     * — `4 °C → 71 °C`, `8+ hours` and `gravity` are all one value each.
     * R-SCR-41 asks that they be separate, not that they be structured.
     *
     * No check tying it to `kind = 'science'`. An empty array on the other
     * seven kinds costs nothing, and coupling the column to one enum value
     * makes "a warning carries conditions too" a destructive migration.
     */
    conditions: text('conditions')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),

    /**
     * Every subject this note has hung off before the one it hangs off now,
     * oldest first, as `recipe:<slug>`, `ingredient:<slug>` or
     * `experiment:<slug>`. Empty for a note that has never moved, which is
     * almost all of them. This is D-13.
     *
     * **Why a note may move at all.** A note is bound to one subject chosen
     * at write time, and that choice is often forced. Five notes about
     * stock were attached to a batch because no demi-glace recipe existed
     * yet to attach them to; when the recipe arrives, the notes belong on
     * it. Before `reattachNote` the only repair was to write them again on
     * the recipe, which duplicates the text and lets the two copies drift.
     * A note's CONTENT being fixed and its LOCATION being fixed are
     * different decisions: moving one changes nothing about what it says or
     * when it was written. `logExperiment` already re-homes a run this way.
     *
     * **Why the move is recorded rather than silent.** `mcp_audit_log` is
     * written from the arguments a tool was CALLED with, so an audit row
     * for a move can name where the note went and never where it came from.
     * Without this column that fact exists nowhere, and a reader looking at
     * a note on a recipe could not tell it was written against a batch.
     * That is the kind of loss the whole repository is built to refuse.
     *
     * A text array rather than a child table, following `conditions` and
     * `ingredients.aliases`: nothing joins on these and no screen filters
     * by them. The slug is stored rather than a foreign key on purpose — a
     * subject that is later deleted takes its row with it, and the point of
     * this column is to survive that.
     */
    previousSubjects: text('previous_subjects')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),

    /**
     * Where this note sorts among the notes of its subject. Part of D-13.
     *
     * **Why `created_at` could not keep doing this job.** It was the primary
     * sort key, and `position` its tiebreak, because until `reattachNote`
     * every note was written where it stays: a note's write time and its
     * arrival at its subject were the same instant, so one column meant
     * both things. A move breaks that. The note keeps the date it was
     * written — deliberately, since rewriting it would falsify when the
     * claim was made — but it arrives at its new subject today.
     *
     * With `created_at` sorting, a note written against a batch in 2024 and
     * moved onto a recipe in 2026 lands FIRST among that recipe's notes,
     * not last. That is not merely untidy: `listScienceIndex` and
     * `getScienceStudy` number a study's mechanisms `M1…Mn` by position in
     * this list, so moving one science note renumbers every mechanism below
     * it — codes that are already published. That is the exact fault D-02
     * records, arriving by a new route.
     *
     * So the two meanings are separated. `created_at` says when the note was
     * written and never changes. This says where it sits, and only a move
     * changes it. Backfilled to `created_at`, so no stored note moved and
     * `pnpm export` writes the same bytes it did before.
     */
    sortAt: timestamp('sort_at', { withTimezone: true }).defaultNow().notNull(),

    /**
     * Where this note sits among the notes on the same subject. 1-based,
     * assigned by `writeNotes` as `MAX(position) + 1` for the subject.
     *
     * **Why the column exists.** `created_at` defaults to `now()`, and
     * Postgres holds `now()` fixed for the whole transaction — so every
     * note written by one `createRecipe` call carries the same timestamp
     * to the microsecond. Ordering by it alone left the order of a
     * recipe's notes to the planner, and the codes drawn from that order
     * with it: `/science` numbers a study's mechanisms `M1…Mn` by position
     * in this list, and Beef Wellington's four science notes all arrive in
     * one transaction. The tiebreak that stood here was `asc(notes.id)`, a
     * random uuid, so the four codes were a fresh shuffle on every ingest.
     * D-02 records the same fact as the reason `pnpm export` reordered
     * notes between two loads of one seed.
     *
     * **Why it is per subject and not global.** `position` means the same
     * thing everywhere else in this schema — an ordinal within one parent
     * (`recipe_ingredients`, `recipe_steps`, `recipe_mass_flow_stages`) —
     * and a note's parent is its subject. A global sequence would have
     * been a second meaning for the word, and `ADD COLUMN … bigserial`
     * assigns its values in heap order, which is the arbitrary order this
     * column exists to replace.
     *
     * **So `created_at` stays the primary sort key and this is its
     * tiebreak** — `ORDER BY created_at, position, id`. Notes are read in
     * mixed-subject sets: `getRecipeBySlug` reads the recipe's notes and
     * the current revision's together, and `getScienceStudy` adds the
     * steps' and the runs'. Sorting on `position` first would interleave
     * those groups by ordinal, putting a revision-6 note above a note on
     * the recipe. `created_at` sequences the groups — one transaction only
     * ever writes one subject, so it is exact between groups — and this
     * column sequences within a group, which is the one thing `created_at`
     * cannot do. `id` stays on the end so the sort is total.
     *
     * The `DEFAULT 0` exists so migration `0006` could add the column to a
     * loaded table without a rewrite. Nothing writes 0: `writeNotes` is
     * the only insert path for this table and it always names a position.
     */
    position: integer('position').notNull().default(0),

    // Exactly one of these is set — enforced by the check below.
    recipeId: uuid('recipe_id').references(() => recipes.id, {
      onDelete: 'cascade',
    }),
    revisionId: uuid('revision_id').references(() => recipeRevisions.id, {
      onDelete: 'cascade',
    }),
    stepId: uuid('step_id').references(() => recipeSteps.id, {
      onDelete: 'cascade',
    }),
    ingredientId: uuid('ingredient_id').references(() => ingredients.id, {
      onDelete: 'cascade',
    }),
    experimentId: uuid('experiment_id').references(() => experiments.id, {
      onDelete: 'cascade',
    }),

    createdAt: now(),
    updatedAt: touched(),
    ...softDelete(),
  },
  (t) => [
    index('idx_notes_recipe').on(t.recipeId),
    index('idx_notes_revision').on(t.revisionId),
    index('idx_notes_ingredient').on(t.ingredientId),
    index('idx_notes_kind').on(t.kind),
    index('idx_notes_deleted')
      .on(t.deletedAt.desc())
      .where(sql`${t.deletedAt} IS NOT NULL`),
    index('idx_notes_deleted_event')
      .on(t.deletedEventId)
      .where(sql`${t.deletedEventId} IS NOT NULL`),
    // A note hangs off exactly one subject. Anything else makes "show me the
    // notes for X" ambiguous and lets orphans accumulate silently.
    check(
      'note_has_exactly_one_subject',
      sql`(
        (${t.recipeId} IS NOT NULL)::int +
        (${t.revisionId} IS NOT NULL)::int +
        (${t.stepId} IS NOT NULL)::int +
        (${t.ingredientId} IS NOT NULL)::int +
        (${t.experimentId} IS NOT NULL)::int
      ) = 1`,
    ),
  ],
);

/** Citations for a note — what research notes are actually made of. */
export const noteSources = pgTable(
  'note_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    noteId: uuid('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    url: text('url'),
    title: text('title'),
    citation: text('citation'),
    accessedAt: date('accessed_at'),
    /**
     * Where this citation sits among the citations on one note. 1-based,
     * assigned by `writeNotes`.
     *
     * The same fault as `notes.position`, one level down and just as
     * visible: every source of a note is written in the note's own
     * transaction, so they all share `created_at` and the order fell to
     * `asc(note_sources.id)`. Demi-glace's "Why each layer exists" cites
     * four works and the Berlin boil's sourcing note cites three, so the
     * reference list on `/science/[slug]` renumbered `[1]…[4]` between
     * loads and every `current.md` under content/generated/ reordered its
     * `- Source:` lines for no reason a reader could act on.
     */
    position: integer('position').notNull().default(0),
    createdAt: now(),
  },
  (t) => [index('idx_note_sources_note').on(t.noteId)],
);

// ─────────────────────────────────────────────────────────────────────────
// Experiments — a recorded run of a revision (the biltong batch logs)
// ─────────────────────────────────────────────────────────────────────────

export const experiments = pgTable(
  'experiments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    recipeId: uuid('recipe_id').references(() => recipes.id, {
      onDelete: 'set null',
    }),
    /**
     * The exact revision that was cooked, when it is known.
     *
     * A run is NOT taken along when that revision is deleted: the run
     * happened, and its number and its title are still readable because the
     * revision row is still there. The two experiment reads join the base
     * table rather than the live view for exactly this, and set
     * `revisionWithdrawn` from `deleted_at IS NOT NULL` so the page can say
     * "third revision · withdrawn". A hard delete would fire the
     * `ON DELETE SET NULL` below and make the run read "no version recorded",
     * which is a false statement about a run that recorded one.
     */
    revisionId: uuid('revision_id').references(() => recipeRevisions.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    summary: text('summary'),
    startedAt: date('started_at'),
    completedAt: date('completed_at'),
    /** Multiplier applied to the revision's quantities for this run. */
    scaleFactor: numeric('scale_factor', { precision: 10, scale: 4 }),
    outcome: text('outcome'),
    costTotal: numeric('cost_total', { precision: 12, scale: 2 }),
    currency: text('currency').default('EUR'),
    /**
     * The one picture that stands for the run. A run also takes a LIST —
     * `experiment_images` below — because a run is the record that most
     * needs photographs and one run produces several.
     */
    heroImageUrl: text('hero_image_url'),
    heroImageAlt: text('hero_image_alt'),
    createdAt: now(),
    updatedAt: touched(),
    ...softDelete(),
  },
  (t) => [
    index('idx_experiments_recipe').on(t.recipeId),
    index('idx_experiments_deleted')
      .on(t.deletedAt.desc())
      .where(sql`${t.deletedAt} IS NOT NULL`),
    index('idx_experiments_deleted_event')
      .on(t.deletedEventId)
      .where(sql`${t.deletedEventId} IS NOT NULL`),
  ],
);

/** An individually tracked unit within a run — one hanging piece, one jar. */
export const experimentItems = pgTable(
  'experiment_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    experimentId: uuid('experiment_id')
      .notNull()
      .references(() => experiments.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    position: integer('position').notNull(),
    note: text('note'),
  },
  (t) => [
    uniqueIndex('uq_experiment_item_label').on(t.experimentId, t.label),
    index('idx_experiment_items_experiment').on(t.experimentId),
  ],
);

/**
 * The pictures of a run, in the order they should be read.
 *
 * A CHILD, and it follows the rule every other child here follows: no id of
 * its own worth addressing, no soft delete, and no per-row update. A caller
 * replaces the list by sending the parent's whole list, and its lifetime is
 * its parent's. `upload_image` appending one row is the single exception the
 * write layer makes, and it is an append rather than a rewrite for the
 * reason the tool description gives: a caller holding one photograph does
 * not hold the other five.
 *
 * `image_url` and not an `images.id` foreign key, deliberately. The column
 * holds the same kind of value `recipes.hero_image_url` has always held — an
 * address — so a run can carry a picture that was never uploaded here, and
 * the site renders both without knowing which is which.
 */
export const experimentImages = pgTable(
  'experiment_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    experimentId: uuid('experiment_id')
      .notNull()
      .references(() => experiments.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    imageUrl: text('image_url').notNull(),
    imageAlt: text('image_alt'),
    caption: text('caption'),
    createdAt: now(),
  },
  (t) => [
    uniqueIndex('uq_experiment_image_position').on(t.experimentId, t.position),
    index('idx_experiment_images_experiment').on(t.experimentId),
  ],
);

/**
 * A single recorded number. Deliberately generic (metric/value/unit) rather
 * than a column per thing measured — the biltong logs alone track gross
 * weight, net weight, dried weight, days to cut and per-piece cost, and the
 * next preservation project will want pH and brine salinity.
 */
export const experimentObservations = pgTable(
  'experiment_observations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    experimentId: uuid('experiment_id')
      .notNull()
      .references(() => experiments.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id').references(() => experimentItems.id, {
      onDelete: 'cascade',
    }),
    recordedAt: date('recorded_at'),
    metric: text('metric').notNull(),
    value: numeric('value', { precision: 14, scale: 4 }),
    unit: text('unit'),
    note: text('note'),
    createdAt: now(),
  },
  (t) => [
    index('idx_observations_experiment').on(t.experimentId),
    index('idx_observations_item').on(t.itemId),
    index('idx_observations_metric').on(t.metric),
  ],
);

// ─────────────────────────────────────────────────────────────────────────
// 6. Images
// ─────────────────────────────────────────────────────────────────────────

/**
 * Every picture this repository stores, and the SEVENTH soft-deletable table.
 *
 * Before this existed, `recipes.hero_image_url` and `recipe_steps.image_url`
 * took a web address and nothing could make one. An agent in a chat session
 * holds a photograph as bytes; it has no address for it and no way to mint
 * one, so the field was reachable in theory and unreachable in practice.
 * That is issue #54. `upload_image` is the answer and this is where it lands
 * the row.
 *
 * **THE BYTES ARE NOT HERE.** They go to Vercel Blob, and `blob_url` is
 * where they went. This row is the registry: what was stored, what it looks
 * like, who it belongs to, and whether it is still visible. Two reasons it is
 * a row and not just a blob. A blob store has no `deleted_at`, so a picture
 * could never take part in the delete-and-restore rule the rest of the
 * repository runs on; and a blob nobody has a record of is the orphan the
 * issue asked us not to create.
 *
 * **What a recipe stores is `/images/<id>`, NOT `blob_url`.** This is the
 * decision the whole design turns on, so it is written down here rather than
 * left to be inferred from the route handler.
 *
 * A soft delete has to make a record stop being visible. The reference from
 * a recipe to its picture is a TEXT COLUMN and not a foreign key — it always
 * was, because a recipe may legitimately point at a picture on somebody
 * else's site. So deleting an image row can do nothing about a recipe that
 * names it. If the stored value were the blob address, a deleted picture
 * would keep rendering on every page that referenced it, and the only fix
 * would be a delete that rewrote rows across four tables and inside stored
 * revisions — a cascade that edits versions people cooked from, to hide a
 * photograph.
 *
 * Serving the picture from our own address instead makes that cascade
 * unnecessary. `/images/<id>` reads `images_live`; a deleted row is a 404;
 * every reference to it goes dark at once and comes back whole on a restore,
 * and no revision is touched. The blob address stays an implementation
 * detail of this table.
 *
 * **What that does not buy.** A Vercel blob is public — the SDK has no other
 * access mode — so anyone who kept the `blob_url` can still fetch the file
 * after the row is deleted. The path is unguessable (Vercel appends a random
 * suffix) and this table is the only place the address is written down, so
 * "deleted" here means the picture leaves the site and the tools, not that
 * the bytes are destroyed. Nothing in this repository destroys bytes, and
 * `restore_record` is exact because of it.
 *
 * `checksum` is the sha256 of the stored bytes, and it is what makes a
 * second upload of the same photograph return the first row instead of
 * paying for the same file twice.
 */
export const images = pgTable(
  'images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Where the bytes actually are. Never rendered; `/images/<id>` is. */
    blobUrl: text('blob_url').notNull(),
    /** The blob's pathname, which is what deleting it from the store needs. */
    blobPathname: text('blob_pathname').notNull(),
    /** Always the stored type, which is what came out of the re-encode. */
    mimeType: text('mime_type').notNull(),
    /**
     * Required, and required at the tool as well. The guide has always said
     * to write alt text; a column that allows null is a column that collects
     * nulls.
     */
    alt: text('alt').notNull(),
    caption: text('caption'),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    bytes: integer('bytes').notNull(),
    /** sha256 of the stored bytes. Unique, and that is the de-duplication. */
    checksum: text('checksum').notNull(),
    createdAt: now(),
    updatedAt: touched(),
    ...softDelete(),
  },
  (t) => [
    uniqueIndex('uq_images_checksum').on(t.checksum),
    index('idx_images_deleted')
      .on(t.deletedAt.desc())
      .where(sql`${t.deletedAt} IS NOT NULL`),
    index('idx_images_deleted_event')
      .on(t.deletedEventId)
      .where(sql`${t.deletedEventId} IS NOT NULL`),
  ],
);

// ─────────────────────────────────────────────────────────────────────────
// MCP OAuth 2.1 + Dynamic Client Registration
//
// Ported from the intake-tracker reference implementation. Identity here is
// a single administrator rather than a multi-user auth provider, so
// `user_id` carries the admin principal and has no FK to a users table.
// ─────────────────────────────────────────────────────────────────────────

export const mcpOauthClients = pgTable(
  'mcp_oauth_clients',
  {
    clientId: text('client_id').primaryKey(),
    clientSecretHash: text('client_secret_hash'),
    clientName: text('client_name').notNull(),
    redirectUris: text('redirect_uris').array().notNull(),
    tokenEndpointAuthMethod: text('token_endpoint_auth_method').notNull(),
    scope: text('scope'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    lastUsedAt: bigint('last_used_at', { mode: 'number' }),
  },
  (t) => [
    check(
      'mcp_oauth_clients_auth_method_check',
      sql`${t.tokenEndpointAuthMethod} IN ('none','client_secret_basic','client_secret_post')`,
    ),
  ],
);

export const mcpAuthCodes = pgTable(
  'mcp_auth_codes',
  {
    code: text('code').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => mcpOauthClients.clientId, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    redirectUri: text('redirect_uri').notNull(),
    codeChallenge: text('code_challenge').notNull(),
    codeChallengeMethod: text('code_challenge_method').notNull(),
    scope: text('scope').notNull(),
    expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
    consumedAt: bigint('consumed_at', { mode: 'number' }),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  },
  (t) => [
    check(
      'mcp_auth_codes_challenge_method_check',
      sql`${t.codeChallengeMethod} IN ('S256')`,
    ),
    index('idx_mcp_auth_codes_client').on(t.clientId),
    index('idx_mcp_auth_codes_expires').on(t.expiresAt),
  ],
);

export const mcpAccessTokens = pgTable(
  'mcp_access_tokens',
  {
    tokenHash: text('token_hash').primaryKey(),
    refreshTokenHash: text('refresh_token_hash').unique(),
    clientId: text('client_id')
      .notNull()
      .references(() => mcpOauthClients.clientId, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    scope: text('scope').notNull(),
    expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
    refreshExpiresAt: bigint('refresh_expires_at', { mode: 'number' }),
    revokedAt: bigint('revoked_at', { mode: 'number' }),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    lastUsedAt: bigint('last_used_at', { mode: 'number' }),
  },
  (t) => [
    index('idx_mcp_access_tokens_user').on(t.userId),
    index('idx_mcp_access_tokens_expires').on(t.expiresAt),
  ],
);

export const mcpAuditLog = pgTable(
  'mcp_audit_log',
  {
    id: serial('id').primaryKey(),
    timestamp: timestamp('timestamp', { withTimezone: true })
      .defaultNow()
      .notNull(),
    userId: text('user_id').notNull(),
    clientId: text('client_id').notNull(),
    tool: text('tool').notNull(),
    argsJson: text('args_json'),
    status: text('status').notNull(),
    errorMessage: text('error_message'),
    durationMs: integer('duration_ms'),
  },
  (t) => [
    check(
      'mcp_audit_log_status_check',
      sql`${t.status} IN ('success','error')`,
    ),
    index('idx_mcp_audit_ts').on(t.timestamp),
  ],
);

// ─────────────────────────────────────────────────────────────────────────
// The live views — what a read is allowed to see
//
// One view per soft-deletable table, each the table minus its deleted rows.
// `src/lib/queries/read.ts` selects from these and from nothing else, and
// that is enforced rather than agreed: `eslint.config.mjs` bans the seven
// base tables from being imported into that file, so a new query CANNOT name
// one and `pnpm lint` is a CI gate. A shared `and(live(t), …)` helper was the
// other option and is weaker for one reason — a helper can be left out of a
// new query, an import ban cannot.
//
// Two files see the base tables on purpose. `src/lib/queries/deleted.ts`
// reads deleted rows, because listing the bin is its whole job; and the two
// experiment reads take `recipe_revisions` unfiltered, so a batch log pinned
// to a withdrawn version can still print its number.
// ─────────────────────────────────────────────────────────────────────────

export const recipesLive = pgView('recipes_live').as((qb) =>
  qb.select().from(recipes).where(isNull(recipes.deletedAt)),
);

export const recipeRevisionsLive = pgView('recipe_revisions_live').as((qb) =>
  qb.select().from(recipeRevisions).where(isNull(recipeRevisions.deletedAt)),
);

export const notesLive = pgView('notes_live').as((qb) =>
  qb.select().from(notes).where(isNull(notes.deletedAt)),
);

export const experimentsLive = pgView('experiments_live').as((qb) =>
  qb.select().from(experiments).where(isNull(experiments.deletedAt)),
);

export const ingredientsLive = pgView('ingredients_live').as((qb) =>
  qb.select().from(ingredients).where(isNull(ingredients.deletedAt)),
);

export const taxonomyTermsLive = pgView('taxonomy_terms_live').as((qb) =>
  qb.select().from(taxonomyTerms).where(isNull(taxonomyTerms.deletedAt)),
);

/**
 * The seventh, and the one whose reader is a route handler rather than a
 * page. `/images/[id]` selects from this, so deleting an image row is what
 * makes every reference to it 404 at once — see `images` above for why the
 * stored address is ours and not the blob's.
 */
export const imagesLive = pgView('images_live').as((qb) =>
  qb.select().from(images).where(isNull(images.deletedAt)),
);
