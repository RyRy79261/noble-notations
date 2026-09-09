CREATE TABLE "recipe_mass_flow_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mass_flow_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	"quantity" numeric(12, 4),
	"quantity_max" numeric(12, 4),
	"unit" text,
	"duration_minutes" integer,
	"duration_max_minutes" integer,
	"emphasis" boolean DEFAULT false NOT NULL,
	"raw_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mass_flow_stage_single_figure" CHECK ("recipe_mass_flow_stages"."quantity" IS NULL OR "recipe_mass_flow_stages"."duration_minutes" IS NULL),
	CONSTRAINT "mass_flow_stage_has_a_figure" CHECK (COALESCE("recipe_mass_flow_stages"."quantity", "recipe_mass_flow_stages"."duration_minutes") IS NOT NULL
          OR "recipe_mass_flow_stages"."raw_text" IS NOT NULL),
	CONSTRAINT "mass_flow_stage_quantity_range" CHECK ("recipe_mass_flow_stages"."quantity_max" IS NULL
          OR ("recipe_mass_flow_stages"."quantity" IS NOT NULL AND "recipe_mass_flow_stages"."quantity_max" >= "recipe_mass_flow_stages"."quantity")),
	CONSTRAINT "mass_flow_stage_duration_range" CHECK ("recipe_mass_flow_stages"."duration_max_minutes" IS NULL
          OR ("recipe_mass_flow_stages"."duration_minutes" IS NOT NULL
              AND "recipe_mass_flow_stages"."duration_max_minutes" >= "recipe_mass_flow_stages"."duration_minutes"))
);
--> statement-breakpoint
CREATE TABLE "recipe_mass_flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"net_change_percent" numeric(6, 2),
	"rate_percent_per_day" numeric(6, 2),
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "conditions" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "recipe_mass_flow_stages" ADD CONSTRAINT "recipe_mass_flow_stages_mass_flow_id_recipe_mass_flows_id_fk" FOREIGN KEY ("mass_flow_id") REFERENCES "public"."recipe_mass_flows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_mass_flows" ADD CONSTRAINT "recipe_mass_flows_revision_id_recipe_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."recipe_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_mass_flow_stages_flow" ON "recipe_mass_flow_stages" USING btree ("mass_flow_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mass_flow_stage_position" ON "recipe_mass_flow_stages" USING btree ("mass_flow_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mass_flow_revision" ON "recipe_mass_flows" USING btree ("revision_id");