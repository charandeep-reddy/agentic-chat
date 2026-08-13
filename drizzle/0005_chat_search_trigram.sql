-- Sidebar search matches a chat by its title *or* by any message body, both
-- with `ILIKE '%q%'`. A leading wildcard can use no btree index, so the message
-- half ran as a correlated subquery that read every message body of every
-- candidate chat, on every keystroke. Trigram GIN indexes make both predicates
-- index scans.
--
-- The extension has to exist before `gin_trgm_ops` can be named, and drizzle
-- does not generate it — the two CREATE INDEX lines below are generated, this
-- line is not.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "chat_title_trgm_idx" ON "chat" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
-- Indexing the jsonb cast is allowed because the cast is immutable; checked
-- against Postgres rather than assumed.
CREATE INDEX "message_parts_trgm_idx" ON "message" USING gin (("parts"::text) gin_trgm_ops);
