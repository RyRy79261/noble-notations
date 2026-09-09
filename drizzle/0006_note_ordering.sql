ALTER TABLE "note_sources" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
--
-- Everything above this line is what `pnpm db:generate` wrote. Everything
-- below is the backfill, added by hand because a generator has no opinion
-- about what a column should hold on the rows that already exist.
--
-- Both statements are additive: `ADD COLUMN` with a *constant* default is
-- catalogue-only on PostgreSQL 11 and later, so neither rewrites a loaded
-- table, and there is no DROP and no ALTER COLUMN in this file.
--
-- THE ROWS THAT ALREADY EXIST. `DEFAULT 0` would leave every stored note
-- at the same position, which is the tie this column was added to break.
-- The order they get instead is `(created_at, id)` — the exact order the
-- site is serving today. That is arbitrary, and it is arbitrary because
-- the insert order was never recorded; nothing in the table remembers it.
-- `ctid` looks like it would, and does not: `describe_mechanism` UPDATEs
-- `notes.conditions`, and an updated row moves. So this freezes the live
-- order rather than inventing a new one — nobody's page changes at the
-- moment this migration runs, and the next `pnpm ingest` into a fresh
-- database writes real positions from the seed.
--
-- `PARTITION BY` names all five subject columns. A note hangs off exactly
-- one of them (`note_has_exactly_one_subject`) and the other four are
-- NULL, and a window partition treats NULL as a value it can group on, so
-- this is "partition by the subject" written in columns.
--
-- Idempotent: a re-run recomputes the same numbers over the same rows.
UPDATE "notes" AS n
   SET "position" = ordered.rn
  FROM (
    SELECT "id",
           row_number() OVER (
             PARTITION BY "recipe_id", "revision_id", "step_id",
                          "ingredient_id", "experiment_id"
             ORDER BY "created_at", "id"
           ) AS rn
      FROM "notes"
  ) AS ordered
 WHERE n."id" = ordered."id";--> statement-breakpoint
UPDATE "note_sources" AS s
   SET "position" = ordered.rn
  FROM (
    SELECT "id",
           row_number() OVER (
             PARTITION BY "note_id"
             ORDER BY "created_at", "id"
           ) AS rn
      FROM "note_sources"
  ) AS ordered
 WHERE s."id" = ordered."id";
