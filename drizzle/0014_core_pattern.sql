ALTER TYPE "public"."taxonomy_facet" ADD VALUE 'pattern';--> statement-breakpoint
CREATE TABLE "recipe_core_pattern_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pattern_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"role" text NOT NULL,
	"uses" text NOT NULL,
	"purpose" text NOT NULL,
	"essential" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_core_pattern_swaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"use" text NOT NULL,
	"tradeoff" text NOT NULL,
	"safety" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_core_patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"formula" text NOT NULL,
	"method" text[] NOT NULL,
	"full_recipe_adds" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recipe_core_pattern_roles" ADD CONSTRAINT "recipe_core_pattern_roles_pattern_id_recipe_core_patterns_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."recipe_core_patterns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_core_pattern_swaps" ADD CONSTRAINT "recipe_core_pattern_swaps_role_id_recipe_core_pattern_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."recipe_core_pattern_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_core_patterns" ADD CONSTRAINT "recipe_core_patterns_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_core_pattern_roles_pattern" ON "recipe_core_pattern_roles" USING btree ("pattern_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_core_pattern_role_position" ON "recipe_core_pattern_roles" USING btree ("pattern_id","position");--> statement-breakpoint
CREATE INDEX "idx_core_pattern_swaps_role" ON "recipe_core_pattern_swaps" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_core_pattern_swap_position" ON "recipe_core_pattern_swaps" USING btree ("role_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_core_pattern_recipe" ON "recipe_core_patterns" USING btree ("recipe_id");