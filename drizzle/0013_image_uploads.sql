/*
 * Upload links and smaller copies of each picture. Issues #56 and #58.
 *
 * `image_uploads` holds the links `request_image_upload` hands out, so a
 * photograph reaches the store from the phone that took it and never passes
 * through the model as base64. `images.renditions` holds the smaller widths
 * made at upload, which `/images/<id>?w=` chooses between.
 *
 * `images_live` is dropped and made again because Postgres fixes the column
 * list of a view when the view is created. Without that, the view would not
 * carry `renditions`.
 */
CREATE TABLE "image_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" text NOT NULL,
	"client_id" text NOT NULL,
	"alt" text,
	"caption" text,
	"attach_to" jsonb NOT NULL,
	"target" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"image_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP VIEW "public"."images_live";--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "renditions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "image_uploads" ADD CONSTRAINT "image_uploads_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_image_uploads_token_hash" ON "image_uploads" USING btree ("token_hash");--> statement-breakpoint
CREATE VIEW "public"."images_live" AS (select "id", "blob_url", "blob_pathname", "mime_type", "alt", "caption", "width", "height", "bytes", "checksum", "renditions", "created_at", "updated_at", "deleted_at", "deleted_by", "deleted_reason", "deleted_event_id" from "images" where "images"."deleted_at" is null);