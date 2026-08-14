DROP INDEX "chat_user_list_idx";--> statement-breakpoint
DROP INDEX "chat_project_list_idx";--> statement-breakpoint
DROP INDEX "project_user_idx";--> statement-breakpoint
CREATE INDEX "chat_user_list_idx" ON "chat" USING btree ("user_id","pinned" DESC NULLS LAST,"updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "chat_project_list_idx" ON "chat" USING btree ("user_id","project_id","pinned" DESC NULLS LAST,"updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "project_user_idx" ON "project" USING btree ("user_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "chat" DROP COLUMN "archived";--> statement-breakpoint
ALTER TABLE "project" DROP COLUMN "archived";