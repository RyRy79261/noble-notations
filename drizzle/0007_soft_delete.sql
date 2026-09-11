ALTER TABLE "experiments" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "deleted_by" text;--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "deleted_reason" text;--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "deleted_event_id" uuid;--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "deleted_by" text;--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "deleted_reason" text;--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "deleted_event_id" uuid;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "deleted_by" text;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "deleted_reason" text;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "deleted_event_id" uuid;--> statement-breakpoint
ALTER TABLE "recipe_revisions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "recipe_revisions" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "recipe_revisions" ADD COLUMN "deleted_by" text;--> statement-breakpoint
ALTER TABLE "recipe_revisions" ADD COLUMN "deleted_reason" text;--> statement-breakpoint
ALTER TABLE "recipe_revisions" ADD COLUMN "deleted_event_id" uuid;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "deleted_by" text;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "deleted_reason" text;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "deleted_event_id" uuid;--> statement-breakpoint
ALTER TABLE "taxonomy_terms" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "taxonomy_terms" ADD COLUMN "deleted_by" text;--> statement-breakpoint
ALTER TABLE "taxonomy_terms" ADD COLUMN "deleted_reason" text;--> statement-breakpoint
ALTER TABLE "taxonomy_terms" ADD COLUMN "deleted_event_id" uuid;--> statement-breakpoint
CREATE INDEX "idx_experiments_deleted" ON "experiments" USING btree ("deleted_at" DESC NULLS LAST) WHERE "experiments"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_experiments_deleted_event" ON "experiments" USING btree ("deleted_event_id") WHERE "experiments"."deleted_event_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_ingredients_deleted" ON "ingredients" USING btree ("deleted_at" DESC NULLS LAST) WHERE "ingredients"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_ingredients_deleted_event" ON "ingredients" USING btree ("deleted_event_id") WHERE "ingredients"."deleted_event_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_notes_deleted" ON "notes" USING btree ("deleted_at" DESC NULLS LAST) WHERE "notes"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_notes_deleted_event" ON "notes" USING btree ("deleted_event_id") WHERE "notes"."deleted_event_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_recipe_revisions_deleted" ON "recipe_revisions" USING btree ("deleted_at" DESC NULLS LAST) WHERE "recipe_revisions"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_recipe_revisions_deleted_event" ON "recipe_revisions" USING btree ("deleted_event_id") WHERE "recipe_revisions"."deleted_event_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_recipes_deleted" ON "recipes" USING btree ("deleted_at" DESC NULLS LAST) WHERE "recipes"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_recipes_deleted_event" ON "recipes" USING btree ("deleted_event_id") WHERE "recipes"."deleted_event_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_taxonomy_terms_deleted" ON "taxonomy_terms" USING btree ("deleted_at" DESC NULLS LAST) WHERE "taxonomy_terms"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_taxonomy_terms_deleted_event" ON "taxonomy_terms" USING btree ("deleted_event_id") WHERE "taxonomy_terms"."deleted_event_id" IS NOT NULL;--> statement-breakpoint
CREATE VIEW "public"."experiments_live" AS (select "id", "slug", "recipe_id", "revision_id", "title", "summary", "started_at", "completed_at", "scale_factor", "outcome", "cost_total", "currency", "created_at", "updated_at", "deleted_at", "deleted_by", "deleted_reason", "deleted_event_id" from "experiments" where "experiments"."deleted_at" is null);--> statement-breakpoint
CREATE VIEW "public"."ingredients_live" AS (select "id", "slug", "name", "plural", "category", "description", "density_g_per_ml", "default_unit", "aliases", "created_at", "updated_at", "deleted_at", "deleted_by", "deleted_reason", "deleted_event_id" from "ingredients" where "ingredients"."deleted_at" is null);--> statement-breakpoint
CREATE VIEW "public"."notes_live" AS (select "id", "kind", "title", "body", "conditions", "position", "recipe_id", "revision_id", "step_id", "ingredient_id", "experiment_id", "created_at", "updated_at", "deleted_at", "deleted_by", "deleted_reason", "deleted_event_id" from "notes" where "notes"."deleted_at" is null);--> statement-breakpoint
CREATE VIEW "public"."recipe_revisions_live" AS (select "id", "recipe_id", "revision_number", "title", "summary", "rationale", "yield_quantity", "yield_unit", "servings", "total_time_minutes", "active_time_minutes", "source", "occurred_at", "created_at", "updated_at", "deleted_at", "deleted_by", "deleted_reason", "deleted_event_id" from "recipe_revisions" where "recipe_revisions"."deleted_at" is null);--> statement-breakpoint
CREATE VIEW "public"."recipes_live" AS (select "id", "slug", "title", "subtitle", "summary", "kind", "status", "current_revision_id", "hero_image_url", "hero_image_alt", "origin_note", "search_vector", "created_at", "updated_at", "deleted_at", "deleted_by", "deleted_reason", "deleted_event_id" from "recipes" where "recipes"."deleted_at" is null);--> statement-breakpoint
CREATE VIEW "public"."taxonomy_terms_live" AS (select "id", "facet", "slug", "label", "description", "parent_id", "created_at", "updated_at", "deleted_at", "deleted_by", "deleted_reason", "deleted_event_id" from "taxonomy_terms" where "taxonomy_terms"."deleted_at" is null);--> statement-breakpoint
--
-- Everything above this line is what `pnpm db:generate` wrote: four columns
-- on six tables, `recipe_revisions.updated_at`, twelve partial indexes and
-- the six `_live` views. drizzle-kit 0.31.10 DID emit the views, so no
-- hand-written companion file was needed for them.
--
-- The file is additive. There is no DROP, no ALTER COLUMN and no type
-- change: every `deleted_at` starts NULL, which is the correct state for
-- every row that already exists, so nothing needs a backfill to read as not
-- deleted. `ADD COLUMN` with a non-volatile default is catalogue-only on
-- PostgreSQL 11 and later, so `updated_at` does not rewrite a loaded table
-- either.
--
-- Everything below is by hand, for the reason drizzle/0001_search_indexes.sql
-- is a hand-written file: a generator has no opinion about a trigger, a
-- function, or what a column should hold on the rows that already exist.
--

-- 1. `recipe_revisions.updated_at` on the rows that already exist.
--
-- The ALTER above gives every stored revision this migration's own timestamp,
-- which would be a claim that the whole archive was corrected the day this
-- ran. Nothing had been: `update_revision` did not exist until this branch, so
-- a stored revision has by definition never been edited and `created_at` is
-- the truthful value. The migrator applies each file once, so this runs once.
UPDATE "recipe_revisions" SET "updated_at" = "created_at";--> statement-breakpoint

-- 2. The search vector stops folding deleted tags and deleted ingredients in.
--
-- THIS IS THE HALF THE READ FILTER CANNOT REACH, and without it a delete is
-- visible in a way nobody would look for. `recipes.search_vector` is a stored
-- tsvector: weight B holds the labels of the recipe's tags and weight D the
-- names of its current revision's ingredients, both folded in by
-- `recipe_search_vector` and refreshed by triggers on `recipe_terms` and
-- `recipe_ingredients` — NOT on the tag row or the ingredient row. So
-- deleting a tag left its label in the index of every recipe carrying it, and
-- `search_recipes` with free text kept matching on a word that is no longer
-- anywhere on the site. Reading through a `_live` view does not help: the
-- vector was computed before the delete and is a column on the recipe.
--
-- Two changes, and each one makes the vector say what the page says:
--
--   * weight B joins `taxonomy_terms` with `deleted_at IS NULL`, so a deleted
--     tag contributes nothing at all. There is no fallback text for a tag, so
--     the label leaves the index outright.
--   * weight D joins `ingredients` with `deleted_at IS NULL` on the LEFT JOIN
--     itself, so a line whose canonical ingredient is deleted degrades to
--     `ri.raw_text` — which is exactly what the recipe page then renders,
--     because `read.ts` reads the line through `ingredients_live` and gets a
--     null ingredient with the raw text beside it. The index and the page
--     agree, which is the property worth having.
--
-- The write layer re-runs `refresh_recipe_search_vector` over the affected
-- recipes on both the delete and the restore of a tag or an ingredient; the
-- function is what decides the answer and this is where it lives.
--
-- CREATE OR REPLACE, so the function keeps its identity and every trigger that
-- already calls it keeps working. No trigger is dropped or recreated here.
CREATE OR REPLACE FUNCTION recipe_search_vector(target_id uuid)
RETURNS tsvector
LANGUAGE sql
STABLE
AS $$
  SELECT
    setweight(to_tsvector('english', coalesce(r.title, '')), 'A') ||
    setweight(
      to_tsvector(
        'english',
        coalesce(r.subtitle, '') || ' ' || coalesce(
          (SELECT string_agg(t.label, ' ')
             FROM recipe_terms rt
             JOIN taxonomy_terms t ON t.id = rt.term_id
            WHERE rt.recipe_id = r.id
              AND t.deleted_at IS NULL),
          '')
      ),
      'B'
    ) ||
    setweight(
      to_tsvector(
        'english',
        coalesce(r.summary, '') || ' ' || coalesce(r.origin_note, '')
      ),
      'C'
    ) ||
    setweight(
      to_tsvector(
        'english',
        coalesce(
          (SELECT string_agg(DISTINCT coalesce(i.name, ri.raw_text), ' ')
             FROM recipe_revisions rev
             JOIN recipe_ingredients ri ON ri.revision_id = rev.id
             LEFT JOIN ingredients i
                    ON i.id = ri.ingredient_id
                   AND i.deleted_at IS NULL
            WHERE rev.id = r.current_revision_id),
          '')
      ),
      'D'
    )
  FROM recipes r
  WHERE r.id = target_id;
$$;
