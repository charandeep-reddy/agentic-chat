-- pgvector ships the `vector` column type, the `<=>` cosine operator, and the
-- HNSW index method used below. drizzle-kit does not emit this line, so it is
-- added by hand: without it every statement after this one fails.
--
-- Managed Postgres providers already have the extension available to install
-- (Neon, Supabase, RDS, Cloud SQL); a local install needs the pgvector package
-- first — `brew install pgvector`, or the `pgvector/pgvector:pg17` image.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "document" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"source" text DEFAULT 'pasted' NOT NULL,
	"mime_type" text DEFAULT 'text/plain' NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"embedding_model" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_chunk" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"user_id" text NOT NULL,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"heading" text,
	"content" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunk" ADD CONSTRAINT "document_chunk_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunk" ADD CONSTRAINT "document_chunk_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_user_idx" ON "document" USING btree ("user_id","enabled");--> statement-breakpoint
CREATE INDEX "document_chunk_document_idx" ON "document_chunk" USING btree ("document_id","ordinal");--> statement-breakpoint
CREATE INDEX "document_chunk_embedding_idx" ON "document_chunk" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "document_chunk_fts_idx" ON "document_chunk" USING gin (to_tsvector('english', "content"));