CREATE TABLE "experiment_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"image_url" text NOT NULL,
	"image_alt" text,
	"caption" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blob_url" text NOT NULL,
	"blob_pathname" text NOT NULL,
	"mime_type" text NOT NULL,
	"alt" text NOT NULL,
	"caption" text,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"checksum" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"deleted_reason" text,
	"deleted_event_id" uuid
);
--> statement-breakpoint
DROP VIEW "public"."experiments_live";--> statement-breakpoint
DROP VIEW "public"."ingredients_live";--> statement-breakpoint
DROP VIEW "public"."taxonomy_terms_live";--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "hero_image_url" text;--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "hero_image_alt" text;--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "hero_image_url" text;--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "hero_image_alt" text;--> statement-breakpoint
ALTER TABLE "taxonomy_terms" ADD COLUMN "hero_image_url" text;--> statement-breakpoint
ALTER TABLE "taxonomy_terms" ADD COLUMN "hero_image_alt" text;--> statement-breakpoint
ALTER TABLE "experiment_images" ADD CONSTRAINT "experiment_images_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_experiment_image_position" ON "experiment_images" USING btree ("experiment_id","position");--> statement-breakpoint
CREATE INDEX "idx_experiment_images_experiment" ON "experiment_images" USING btree ("experiment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_images_checksum" ON "images" USING btree ("checksum");--> statement-breakpoint
CREATE INDEX "idx_images_deleted" ON "images" USING btree ("deleted_at" DESC NULLS LAST) WHERE "images"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_images_deleted_event" ON "images" USING btree ("deleted_event_id") WHERE "images"."deleted_event_id" IS NOT NULL;--> statement-breakpoint
CREATE VIEW "public"."images_live" AS (select "id", "blob_url", "blob_pathname", "mime_type", "alt", "caption", "width", "height", "bytes", "checksum", "created_at", "updated_at", "deleted_at", "deleted_by", "deleted_reason", "deleted_event_id" from "images" where "images"."deleted_at" is null);--> statement-breakpoint
CREATE VIEW "public"."experiments_live" AS (select "id", "slug", "recipe_id", "revision_id", "title", "summary", "started_at", "completed_at", "scale_factor", "outcome", "cost_total", "currency", "hero_image_url", "hero_image_alt", "created_at", "updated_at", "deleted_at", "deleted_by", "deleted_reason", "deleted_event_id" from "experiments" where "experiments"."deleted_at" is null);--> statement-breakpoint
CREATE VIEW "public"."ingredients_live" AS (select "id", "slug", "name", "plural", "category", "description", "hero_image_url", "hero_image_alt", "density_g_per_ml", "default_unit", "aliases", "created_at", "updated_at", "deleted_at", "deleted_by", "deleted_reason", "deleted_event_id" from "ingredients" where "ingredients"."deleted_at" is null);--> statement-breakpoint
CREATE VIEW "public"."taxonomy_terms_live" AS (select "id", "facet", "slug", "label", "description", "hero_image_url", "hero_image_alt", "parent_id", "created_at", "updated_at", "deleted_at", "deleted_by", "deleted_reason", "deleted_event_id" from "taxonomy_terms" where "taxonomy_terms"."deleted_at" is null);