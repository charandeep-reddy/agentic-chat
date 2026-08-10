-- Per-conversation memory scope was reverted, but any database that ran the
-- old 0002 still carries its columns: the migration file went with the revert,
-- so nothing drops them and nothing reads them. This does the drop.
--
-- `IF EXISTS` because a database created after the revert never had them —
-- 0000 and 0001 predate the feature, so a fresh install reaches this migration
-- with no such columns.
ALTER TABLE "chat" DROP COLUMN IF EXISTS "memory_scope";--> statement-breakpoint
ALTER TABLE "chat" DROP COLUMN IF EXISTS "memory_ids";
