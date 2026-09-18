/*
 * Replay `0010_recipe_variants` on any database that skipped it.
 *
 * THIS MIGRATION ADDS NOTHING TO THE SCHEMA. `src/db/schema.ts` is unchanged
 * by it and `meta/0012_snapshot.json` is `0011`'s with a new id. It exists
 * to repair a JOURNAL, and it is a no-op on every database whose journal is
 * already right — which is all of them except the one described below.
 *
 * WHAT WENT WRONG. The migration now called `0011_images` was first
 * committed as `0010_images`. Pushing that branch built a Vercel preview,
 * and `pnpm build` runs `pnpm db:migrate:deploy`, so it was applied to the
 * Preview environment's database and recorded with `when = 1789656794686`.
 * `0010_recipe_variants` then landed on main carrying an EARLIER
 * `when = 1789652861792`.
 *
 * Drizzle applies only the journal entries newer than the last one applied.
 * So on that database `0010_recipe_variants` is not late — it is in the
 * past, and it is skipped on every deployment from now until forever, while
 * the migrator still prints "Migrations applied." Nothing errors. The
 * columns simply are not there, and `recipeSummaryColumns` selects
 * `variant_of_id` on every recipe read, so `listRecipes`, `searchRecipes`,
 * `getTerm`, `getIngredient` and `getRecipeBySlug` all fail and `safeRead`
 * turns each one into the notice a reader sees instead of a recipe.
 *
 * A migration cannot be un-skipped by editing it: changing
 * `0010_recipe_variants` would re-run it on every database that DID apply
 * it, and its enum step would abort there. So the repair is a new entry with
 * a new timestamp, which every database will consider, guarded so that only
 * the one that needs it does any work.
 *
 * THE GUARD IS `recipes.variant_of_id`. Present means 0010 ran and this
 * block returns immediately; absent means it did not, and the whole of 0010
 * is replayed verbatim below. It is one `DO` block rather than the original
 * file's separate statements because the guard has to cover all of them
 * together: the columns must be added BEFORE the rows move and the rows must
 * move BEFORE the enum is recreated, exactly as the original says, and a
 * half-applied middle is the one state neither file could then detect.
 *
 * Read `0010_recipe_variants.sql` for why each step is the way it is. The
 * only edits here are the guard, `IF EXISTS` on the view drop, and
 * `kind::text` in the DELETE so a cached plan cannot outlive the enum value
 * it names.
 */
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		  FROM information_schema.columns
		 WHERE table_schema = 'public'
		   AND table_name   = 'recipes'
		   AND column_name  = 'variant_of_id'
	) THEN
		RETURN;
	END IF;

	RAISE NOTICE 'recipes.variant_of_id is absent: replaying 0010_recipe_variants';

	DROP VIEW IF EXISTS "public"."recipes_live";

	ALTER TABLE "recipes" ADD COLUMN "variant_of_id" uuid;
	ALTER TABLE "recipes" ADD COLUMN "variant_note" text;

	WITH chosen AS (
		SELECT DISTINCT ON (l.from_recipe_id)
		       l.from_recipe_id AS child,
		       l.to_recipe_id   AS parent,
		       l.note           AS note
		  FROM recipe_links l
		 WHERE l.kind::text = 'variant_of'
		   AND l.from_recipe_id <> l.to_recipe_id
		 ORDER BY l.from_recipe_id, l.created_at, l.id
	)
	UPDATE recipes r
	   SET variant_of_id = c.parent,
	       variant_note  = c.note
	  FROM chosen c
	 WHERE r.id = c.child;

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
	 WHERE id IN (SELECT DISTINCT start FROM walk WHERE at = start);

	DELETE FROM recipe_links WHERE kind::text = 'variant_of';

	ALTER TABLE "recipe_links" ALTER COLUMN "kind" SET DATA TYPE text;
	DROP TYPE "public"."recipe_link_kind";
	CREATE TYPE "public"."recipe_link_kind" AS ENUM('derived_from', 'component_of', 'pairs_with', 'references');
	ALTER TABLE "recipe_links" ALTER COLUMN "kind" SET DATA TYPE "public"."recipe_link_kind" USING "kind"::"public"."recipe_link_kind";

	ALTER TABLE "recipes" ADD CONSTRAINT "recipes_variant_of_id_recipes_id_fk" FOREIGN KEY ("variant_of_id") REFERENCES "public"."recipes"("id") ON DELETE set null ON UPDATE no action;
	CREATE INDEX "idx_recipes_variant_of" ON "recipes" USING btree ("variant_of_id") WHERE "recipes"."variant_of_id" IS NOT NULL;
	ALTER TABLE "recipes" ADD CONSTRAINT "variant_not_self" CHECK ("recipes"."variant_of_id" <> "recipes"."id");

	CREATE VIEW "public"."recipes_live" AS (select "id", "slug", "title", "subtitle", "summary", "kind", "status", "current_revision_id", "variant_of_id", "variant_note", "hero_image_url", "hero_image_alt", "origin_note", "search_vector", "created_at", "updated_at", "deleted_at", "deleted_by", "deleted_reason", "deleted_event_id" from "recipes" where "recipes"."deleted_at" is null);
END $$;
