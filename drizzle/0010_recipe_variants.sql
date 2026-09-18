/*
 * Variations become a relationship of their own.
 *
 * A variation is a recipe: dan dan noodles with shiitake instead of pork
 * keeps its own name, its own slug, its own versions and its own batch logs.
 * What it needs is one edge saying where it came from — and that edge is
 * structural, not editorial. It is at most one parent, it must not form a
 * cycle, it decides what the Variations panel draws, and it is what makes
 * two recipes siblings.
 *
 * `recipe_links.kind = 'variant_of'` could hold none of that, so this
 * migration moves every such edge onto `recipes.variant_of_id` and retires
 * the enum value. `src/db/schema.ts` argues the whole decision at the
 * column; this file is only careful about the move.
 *
 * THE ORDER IS LOAD-BEARING. The columns are added BEFORE the rows move, and
 * the rows move BEFORE the enum is recreated — because recreating it runs
 * `kind::recipe_link_kind` over every surviving row, and a row still reading
 * 'variant_of' would fail that cast and abort the deployment.
 */
DROP VIEW "public"."recipes_live";--> statement-breakpoint

ALTER TABLE "recipes" ADD COLUMN "variant_of_id" uuid;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "variant_note" text;--> statement-breakpoint

/*
 * Move the edges. `DISTINCT ON` picks ONE parent per recipe, oldest first:
 * the column holds one and `uq_recipe_link` is unique on (from, to, kind),
 * so a recipe could legally carry two `variant_of` rows and some database
 * somewhere may. The oldest is the one that was meant; the rest are dropped
 * with the others below, which is the honest loss — this migration cannot
 * invent a second column to keep them in.
 *
 * A self-edge is excluded here rather than left for the CHECK constraint to
 * reject at the end of the migration. `recipe_link_not_self` should have
 * made one impossible, and a deployment that aborts on data it could have
 * skipped is a worse outcome than a dropped edge that pointed at itself.
 */
WITH chosen AS (
  SELECT DISTINCT ON (l.from_recipe_id)
         l.from_recipe_id AS child,
         l.to_recipe_id   AS parent,
         l.note           AS note
    FROM recipe_links l
   WHERE l.kind = 'variant_of'
     AND l.from_recipe_id <> l.to_recipe_id
   ORDER BY l.from_recipe_id, l.created_at, l.id
)
UPDATE recipes r
   SET variant_of_id = c.parent,
       variant_note  = c.note
  FROM chosen c
 WHERE r.id = c.child;--> statement-breakpoint

/*
 * Break any cycle the move created, by clearing every recipe that sits on
 * one.
 *
 * `recipe_links` had no constraint against A variant_of B variant_of A —
 * nothing read those edges as a tree, so nothing had to refuse it. As a
 * column it is a tree, the site walks it recursively, and a loop is a page
 * that hangs rather than a page that is wrong. `assertNoVariantCycle` keeps
 * new ones out from here on; this is the one-time sweep for what is already
 * stored.
 *
 * The depth bound is what makes the walk terminate ON a cycle, which is the
 * input it exists to find. Clearing the whole loop rather than one edge of
 * it is deliberate: there is no way to tell from here which edge was meant,
 * and a family whose members are separate dishes is recoverable with one
 * `update_recipe` call, while a wrong guess is not visible at all.
 */
WITH RECURSIVE walk AS (
  SELECT id AS start, variant_of_id AS at, 1 AS depth
    FROM recipes
   WHERE variant_of_id IS NOT NULL
  UNION ALL
  SELECT w.start, r.variant_of_id, w.depth + 1
    FROM walk w
    JOIN recipes r ON r.id = w.at
   WHERE w.at IS NOT NULL
     AND w.depth < 50
)
UPDATE recipes
   SET variant_of_id = NULL,
       variant_note  = NULL
 WHERE id IN (SELECT DISTINCT start FROM walk WHERE at = start);--> statement-breakpoint

DELETE FROM recipe_links WHERE kind = 'variant_of';--> statement-breakpoint

ALTER TABLE "recipe_links" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."recipe_link_kind";--> statement-breakpoint
CREATE TYPE "public"."recipe_link_kind" AS ENUM('derived_from', 'component_of', 'pairs_with', 'references');--> statement-breakpoint
ALTER TABLE "recipe_links" ALTER COLUMN "kind" SET DATA TYPE "public"."recipe_link_kind" USING "kind"::"public"."recipe_link_kind";--> statement-breakpoint

ALTER TABLE "recipes" ADD CONSTRAINT "recipes_variant_of_id_recipes_id_fk" FOREIGN KEY ("variant_of_id") REFERENCES "public"."recipes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_recipes_variant_of" ON "recipes" USING btree ("variant_of_id") WHERE "recipes"."variant_of_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "variant_not_self" CHECK ("recipes"."variant_of_id" <> "recipes"."id");--> statement-breakpoint

CREATE VIEW "public"."recipes_live" AS (select "id", "slug", "title", "subtitle", "summary", "kind", "status", "current_revision_id", "variant_of_id", "variant_note", "hero_image_url", "hero_image_alt", "origin_note", "search_vector", "created_at", "updated_at", "deleted_at", "deleted_by", "deleted_reason", "deleted_event_id" from "recipes" where "recipes"."deleted_at" is null);
