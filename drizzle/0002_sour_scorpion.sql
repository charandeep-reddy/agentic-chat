ALTER TABLE "chat" ADD COLUMN "memory_scope" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat" ADD COLUMN "memory_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;