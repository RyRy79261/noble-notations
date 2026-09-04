CREATE TYPE "public"."ingredient_category" AS ENUM('produce', 'protein', 'dairy', 'grain', 'legume', 'spice', 'herb', 'condiment', 'fat', 'acid', 'sweetener', 'alcohol', 'liquid', 'fungus', 'additive', 'other');--> statement-breakpoint
CREATE TYPE "public"."ingredient_relation_kind" AS ENUM('substitute', 'variety_of', 'component_of');--> statement-breakpoint
CREATE TYPE "public"."note_kind" AS ENUM('observation', 'research', 'substitution', 'warning', 'result', 'idea', 'correction');--> statement-breakpoint
CREATE TYPE "public"."recipe_kind" AS ENUM('recipe', 'preparation', 'process', 'research');--> statement-breakpoint
CREATE TYPE "public"."recipe_link_kind" AS ENUM('derived_from', 'variant_of', 'component_of', 'pairs_with', 'references');--> statement-breakpoint
CREATE TYPE "public"."recipe_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."revision_source" AS ENUM('human', 'mcp', 'import');--> statement-breakpoint
CREATE TYPE "public"."taxonomy_facet" AS ENUM('cuisine', 'course', 'technique', 'diet', 'season', 'equipment', 'occasion', 'preservation', 'texture', 'ingredient_class');--> statement-breakpoint
CREATE TABLE "experiment_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"label" text NOT NULL,
	"position" integer NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "experiment_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"item_id" uuid,
	"recorded_at" date,
	"metric" text NOT NULL,
	"value" numeric(14, 4),
	"unit" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"recipe_id" uuid,
	"revision_id" uuid,
	"title" text NOT NULL,
	"summary" text,
	"started_at" date,
	"completed_at" date,
	"scale_factor" numeric(10, 4),
	"outcome" text,
	"cost_total" numeric(12, 2),
	"currency" text DEFAULT 'EUR',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "experiments_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "ingredient_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_ingredient_id" uuid NOT NULL,
	"to_ingredient_id" uuid NOT NULL,
	"kind" "ingredient_relation_kind" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingredient_relation_not_self" CHECK ("ingredient_relations"."from_ingredient_id" <> "ingredient_relations"."to_ingredient_id")
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"plural" text,
	"category" "ingredient_category" DEFAULT 'other' NOT NULL,
	"description" text,
	"density_g_per_ml" numeric(8, 4),
	"default_unit" text,
	"aliases" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingredients_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "mcp_access_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"refresh_token_hash" text,
	"client_id" text NOT NULL,
	"user_id" text NOT NULL,
	"scope" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"refresh_expires_at" bigint,
	"revoked_at" bigint,
	"created_at" bigint NOT NULL,
	"last_used_at" bigint,
	CONSTRAINT "mcp_access_tokens_refresh_token_hash_unique" UNIQUE("refresh_token_hash")
);
--> statement-breakpoint
CREATE TABLE "mcp_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"client_id" text NOT NULL,
	"tool" text NOT NULL,
	"args_json" text,
	"status" text NOT NULL,
	"error_message" text,
	"duration_ms" integer,
	CONSTRAINT "mcp_audit_log_status_check" CHECK ("mcp_audit_log"."status" IN ('success','error'))
);
--> statement-breakpoint
CREATE TABLE "mcp_auth_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" text NOT NULL,
	"code_challenge_method" text NOT NULL,
	"scope" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"consumed_at" bigint,
	"created_at" bigint NOT NULL,
	CONSTRAINT "mcp_auth_codes_challenge_method_check" CHECK ("mcp_auth_codes"."code_challenge_method" IN ('S256'))
);
--> statement-breakpoint
CREATE TABLE "mcp_oauth_clients" (
	"client_id" text PRIMARY KEY NOT NULL,
	"client_secret_hash" text,
	"client_name" text NOT NULL,
	"redirect_uris" text[] NOT NULL,
	"token_endpoint_auth_method" text NOT NULL,
	"scope" text,
	"created_at" bigint NOT NULL,
	"last_used_at" bigint,
	CONSTRAINT "mcp_oauth_clients_auth_method_check" CHECK ("mcp_oauth_clients"."token_endpoint_auth_method" IN ('none','client_secret_basic','client_secret_post'))
);
--> statement-breakpoint
CREATE TABLE "note_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"url" text,
	"title" text,
	"citation" text,
	"accessed_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "note_kind" NOT NULL,
	"title" text,
	"body" text NOT NULL,
	"recipe_id" uuid,
	"revision_id" uuid,
	"step_id" uuid,
	"ingredient_id" uuid,
	"experiment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_has_exactly_one_subject" CHECK ((
        ("notes"."recipe_id" IS NOT NULL)::int +
        ("notes"."revision_id" IS NOT NULL)::int +
        ("notes"."step_id" IS NOT NULL)::int +
        ("notes"."ingredient_id" IS NOT NULL)::int +
        ("notes"."experiment_id" IS NOT NULL)::int
      ) = 1)
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"ingredient_id" uuid,
	"position" integer NOT NULL,
	"component" text,
	"quantity" numeric(12, 4),
	"quantity_max" numeric(12, 4),
	"unit" text,
	"preparation" text,
	"optional" boolean DEFAULT false NOT NULL,
	"note" text,
	"raw_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_recipe_id" uuid NOT NULL,
	"to_recipe_id" uuid NOT NULL,
	"kind" "recipe_link_kind" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_link_not_self" CHECK ("recipe_links"."from_recipe_id" <> "recipe_links"."to_recipe_id")
);
--> statement-breakpoint
CREATE TABLE "recipe_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"rationale" text,
	"yield_quantity" numeric(10, 3),
	"yield_unit" text,
	"servings" integer,
	"total_time_minutes" integer,
	"active_time_minutes" integer,
	"source" "revision_source" DEFAULT 'human' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "revision_number_positive" CHECK ("recipe_revisions"."revision_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "recipe_step_ingredients" (
	"step_id" uuid NOT NULL,
	"recipe_ingredient_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"phase" text,
	"instruction" text NOT NULL,
	"duration_minutes" integer,
	"duration_max_minutes" integer,
	"temperature_c" numeric(6, 2),
	"equipment" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"technique_term_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_terms" (
	"recipe_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"summary" text,
	"kind" "recipe_kind" DEFAULT 'recipe' NOT NULL,
	"status" "recipe_status" DEFAULT 'active' NOT NULL,
	"current_revision_id" uuid,
	"hero_image_url" text,
	"hero_image_alt" text,
	"origin_note" text,
	"search_vector" "tsvector",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "taxonomy_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facet" "taxonomy_facet" NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"parent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "experiment_items" ADD CONSTRAINT "experiment_items_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_observations" ADD CONSTRAINT "experiment_observations_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_observations" ADD CONSTRAINT "experiment_observations_item_id_experiment_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."experiment_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_revision_id_recipe_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."recipe_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_relations" ADD CONSTRAINT "ingredient_relations_from_ingredient_id_ingredients_id_fk" FOREIGN KEY ("from_ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_relations" ADD CONSTRAINT "ingredient_relations_to_ingredient_id_ingredients_id_fk" FOREIGN KEY ("to_ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_access_tokens" ADD CONSTRAINT "mcp_access_tokens_client_id_mcp_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."mcp_oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_auth_codes" ADD CONSTRAINT "mcp_auth_codes_client_id_mcp_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."mcp_oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_sources" ADD CONSTRAINT "note_sources_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_revision_id_recipe_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."recipe_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_step_id_recipe_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."recipe_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_revision_id_recipe_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."recipe_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_links" ADD CONSTRAINT "recipe_links_from_recipe_id_recipes_id_fk" FOREIGN KEY ("from_recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_links" ADD CONSTRAINT "recipe_links_to_recipe_id_recipes_id_fk" FOREIGN KEY ("to_recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_revisions" ADD CONSTRAINT "recipe_revisions_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_step_ingredients" ADD CONSTRAINT "recipe_step_ingredients_step_id_recipe_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."recipe_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_step_ingredients" ADD CONSTRAINT "recipe_step_ingredients_recipe_ingredient_id_recipe_ingredients_id_fk" FOREIGN KEY ("recipe_ingredient_id") REFERENCES "public"."recipe_ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_steps" ADD CONSTRAINT "recipe_steps_revision_id_recipe_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."recipe_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_steps" ADD CONSTRAINT "recipe_steps_technique_term_id_taxonomy_terms_id_fk" FOREIGN KEY ("technique_term_id") REFERENCES "public"."taxonomy_terms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_terms" ADD CONSTRAINT "recipe_terms_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_terms" ADD CONSTRAINT "recipe_terms_term_id_taxonomy_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."taxonomy_terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomy_terms" ADD CONSTRAINT "taxonomy_terms_parent_id_taxonomy_terms_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."taxonomy_terms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_experiment_item_label" ON "experiment_items" USING btree ("experiment_id","label");--> statement-breakpoint
CREATE INDEX "idx_experiment_items_experiment" ON "experiment_items" USING btree ("experiment_id");--> statement-breakpoint
CREATE INDEX "idx_observations_experiment" ON "experiment_observations" USING btree ("experiment_id");--> statement-breakpoint
CREATE INDEX "idx_observations_item" ON "experiment_observations" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_observations_metric" ON "experiment_observations" USING btree ("metric");--> statement-breakpoint
CREATE INDEX "idx_experiments_recipe" ON "experiments" USING btree ("recipe_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ingredient_relation" ON "ingredient_relations" USING btree ("from_ingredient_id","to_ingredient_id","kind");--> statement-breakpoint
CREATE INDEX "idx_ingredients_category" ON "ingredients" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_mcp_access_tokens_user" ON "mcp_access_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_mcp_access_tokens_expires" ON "mcp_access_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_mcp_audit_ts" ON "mcp_audit_log" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_mcp_auth_codes_client" ON "mcp_auth_codes" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_mcp_auth_codes_expires" ON "mcp_auth_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_note_sources_note" ON "note_sources" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "idx_notes_recipe" ON "notes" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "idx_notes_revision" ON "notes" USING btree ("revision_id");--> statement-breakpoint
CREATE INDEX "idx_notes_ingredient" ON "notes" USING btree ("ingredient_id");--> statement-breakpoint
CREATE INDEX "idx_notes_kind" ON "notes" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "idx_recipe_ingredients_revision" ON "recipe_ingredients" USING btree ("revision_id");--> statement-breakpoint
CREATE INDEX "idx_recipe_ingredients_ingredient" ON "recipe_ingredients" USING btree ("ingredient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_recipe_ingredient_position" ON "recipe_ingredients" USING btree ("revision_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_recipe_link" ON "recipe_links" USING btree ("from_recipe_id","to_recipe_id","kind");--> statement-breakpoint
CREATE INDEX "idx_recipe_links_to" ON "recipe_links" USING btree ("to_recipe_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_revision_number" ON "recipe_revisions" USING btree ("recipe_id","revision_number");--> statement-breakpoint
CREATE INDEX "idx_revisions_recipe" ON "recipe_revisions" USING btree ("recipe_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_step_ingredient" ON "recipe_step_ingredients" USING btree ("step_id","recipe_ingredient_id");--> statement-breakpoint
CREATE INDEX "idx_step_ingredients_ingredient" ON "recipe_step_ingredients" USING btree ("recipe_ingredient_id");--> statement-breakpoint
CREATE INDEX "idx_recipe_steps_revision" ON "recipe_steps" USING btree ("revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_recipe_step_position" ON "recipe_steps" USING btree ("revision_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_recipe_terms" ON "recipe_terms" USING btree ("recipe_id","term_id");--> statement-breakpoint
CREATE INDEX "idx_recipe_terms_term" ON "recipe_terms" USING btree ("term_id");--> statement-breakpoint
CREATE INDEX "idx_recipes_status" ON "recipes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_recipes_kind" ON "recipes" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_taxonomy_facet_slug" ON "taxonomy_terms" USING btree ("facet","slug");--> statement-breakpoint
CREATE INDEX "idx_taxonomy_parent" ON "taxonomy_terms" USING btree ("parent_id");