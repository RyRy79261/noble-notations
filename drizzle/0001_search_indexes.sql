-- Full-text search support.
--
-- Search runs over a weighted tsvector built from the recipe's own text plus
-- its taxonomy terms and ingredient names. Those live in other tables, so the
-- vector cannot be a generated column — it is maintained by a trigger that
-- fires whenever any contributing row changes.
--
-- Weights: A = title, B = subtitle + taxonomy terms, C = summary + origin,
-- D = ingredient names. A title match therefore outranks an incidental
-- ingredient mention.

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
            WHERE rt.recipe_id = r.id),
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
             LEFT JOIN ingredients i ON i.id = ri.ingredient_id
            WHERE rev.id = r.current_revision_id),
          '')
      ),
      'D'
    )
  FROM recipes r
  WHERE r.id = target_id;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION refresh_recipe_search_vector(target_id uuid)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE recipes
     SET search_vector = recipe_search_vector(target_id)
   WHERE id = target_id;
$$;
--> statement-breakpoint

-- Recomputing inside a BEFORE trigger on `recipes` would recurse through the
-- UPDATE in refresh_recipe_search_vector, so the recipes trigger assigns the
-- value directly to NEW instead.
CREATE OR REPLACE FUNCTION trg_recipes_search_vector()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector := recipe_search_vector(NEW.id);
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS recipes_search_vector_update ON recipes;
--> statement-breakpoint

CREATE TRIGGER recipes_search_vector_update
BEFORE INSERT OR UPDATE OF title, subtitle, summary, origin_note, current_revision_id
ON recipes
FOR EACH ROW
EXECUTE FUNCTION trg_recipes_search_vector();
--> statement-breakpoint

-- Taxonomy assignments contribute weight B.
CREATE OR REPLACE FUNCTION trg_recipe_terms_search_vector()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM refresh_recipe_search_vector(COALESCE(NEW.recipe_id, OLD.recipe_id));
  RETURN NULL;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS recipe_terms_search_vector_update ON recipe_terms;
--> statement-breakpoint

CREATE TRIGGER recipe_terms_search_vector_update
AFTER INSERT OR UPDATE OR DELETE ON recipe_terms
FOR EACH ROW
EXECUTE FUNCTION trg_recipe_terms_search_vector();
--> statement-breakpoint

-- Ingredient lines contribute weight D, but only for the revision the recipe
-- currently points at.
CREATE OR REPLACE FUNCTION trg_recipe_ingredients_search_vector()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target uuid;
BEGIN
  SELECT r.id INTO target
    FROM recipes r
   WHERE r.current_revision_id = COALESCE(NEW.revision_id, OLD.revision_id);
  IF target IS NOT NULL THEN
    PERFORM refresh_recipe_search_vector(target);
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS recipe_ingredients_search_vector_update ON recipe_ingredients;
--> statement-breakpoint

CREATE TRIGGER recipe_ingredients_search_vector_update
AFTER INSERT OR UPDATE OR DELETE ON recipe_ingredients
FOR EACH ROW
EXECUTE FUNCTION trg_recipe_ingredients_search_vector();
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_recipes_search_vector
  ON recipes USING gin (search_vector);
--> statement-breakpoint

-- Trigram indexes back the "did you mean" / substring lookups that full-text
-- search misses: partial ingredient names, slugs typed from memory.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_ingredients_name_trgm
  ON ingredients USING gin (name gin_trgm_ops);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_recipes_title_trgm
  ON recipes USING gin (title gin_trgm_ops);
