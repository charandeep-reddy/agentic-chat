import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

/* ------------------------------------------------------------------ *
 * Better Auth core tables
 * Shapes must match what better-auth expects; keep in sync with
 * `bunx @better-auth/cli generate`.
 * ------------------------------------------------------------------ */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/* ------------------------------------------------------------------ *
 * Application tables
 * ------------------------------------------------------------------ */

/** A conversation. Messages hang off it; `shareId` makes it publicly readable. */
export const chat = pgTable(
  "chat",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New chat"),
    model: text("model"),
    pinned: boolean("pinned").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
    /**
     * Which saved memories this conversation may see: "all" (the default),
     * "none", or "selected" — an explicit list in `memoryIds`. The global
     * toggle in settings is all-or-nothing, which leaves someone with work and
     * personal memories in one account no way to keep them apart per chat.
     */
    memoryScope: text("memory_scope").notNull().default("all"),
    memoryIds: jsonb("memory_ids").$type<string[]>().notNull().default([]),
    /** Non-null once the chat has been shared; the public link key. */
    shareId: text("share_id").unique(),
    sharedAt: timestamp("shared_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("chat_user_updated_idx").on(t.userId, t.updatedAt),
    index("chat_title_idx").on(t.title),
  ],
);

/**
 * A message in a chat. `parts` holds the AI SDK UIMessage parts verbatim so
 * tool calls, artifacts and widgets survive a reload untouched.
 *
 * Messages are ordered by `ordinal`. Editing or regenerating truncates
 * everything at a higher ordinal. `parentId` records the message this one
 * replied to; it is unused by the current UI but is what a future branch
 * picker would walk.
 */
export const message = pgTable(
  "message",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    parts: jsonb("parts").notNull(),
    metadata: jsonb("metadata"),
    /** Previous message in this branch; null for the first message. */
    parentId: text("parent_id"),
    ordinal: integer("ordinal").notNull().default(0),
    model: text("model"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("message_chat_ordinal_idx").on(t.chatId, t.ordinal)],
);

/**
 * A remembered fact about the user, injected into the system prompt.
 * `source` distinguishes what the agent learned on its own from what the
 * user wrote by hand or imported from someone else's pack.
 */
export const memory = pgTable(
  "memory",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    /** Free-form bucket: "preference" | "fact" | "project" | "instruction". */
    category: text("category").notNull().default("fact"),
    source: text("source").notNull().default("agent"),
    /** Set when this memory came from an imported pack. */
    importedFromPackId: text("imported_from_pack_id"),
    enabled: boolean("enabled").notNull().default(true),
    /** Bumped whenever the memory is surfaced into a prompt. */
    useCount: integer("use_count").notNull().default(0),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("memory_user_idx").on(t.userId, t.enabled)],
);

/**
 * A publishable bundle of memories — "add memory from others". A user curates
 * a pack, publishes it under a slug, and anyone can import its entries.
 */
export const memoryPack = pgTable(
  "memory_pack",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    /** Array of { content, category } — a frozen copy, not live references. */
    entries: jsonb("entries").notNull(),
    isPublic: boolean("is_public").notNull().default(false),
    installCount: integer("install_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("memory_pack_public_idx").on(t.isPublic, t.installCount)],
);

/** Records that a user installed a pack, so we can offer a one-click uninstall. */
export const memoryPackInstall = pgTable(
  "memory_pack_install",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    packId: text("pack_id")
      .notNull()
      .references(() => memoryPack.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.packId] })],
);

/**
 * A user-authored skill: a named bundle of instructions the model pulls in when
 * it judges them relevant.
 *
 * Only `name` and `description` are inlined into the system prompt. The body is
 * fetched by `load_skill` and the resources by `read_skill_resource`, so a
 * library of fifty skills costs about as much per turn as a paragraph — the
 * whole point of the design. A skill is prose, not code: nothing here is
 * executed.
 */
export const skill = pgTable(
  "skill",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** The handle the model passes back to `load_skill`, e.g. "weekly-report". */
    name: text("name").notNull(),
    /** The trigger: the only thing the model reads before deciding to load. */
    description: text("description").notNull(),
    body: text("body").notNull(),
    /** Path → contents. Named in the body, fetched one at a time on demand. */
    resources: jsonb("resources").$type<Record<string, string>>().notNull().default({}),
    enabled: boolean("enabled").notNull().default(true),
    useCount: integer("use_count").notNull().default(0),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    // The name is an identifier the model types back, so it has to be
    // unambiguous within one user's library.
    uniqueIndex("skill_user_name_idx").on(t.userId, t.name),
    index("skill_user_enabled_idx").on(t.userId, t.enabled),
  ],
);

/**
 * A document the user uploaded for retrieval — the source of truth, kept whole.
 *
 * The original text is stored alongside the chunks so the corpus can be
 * re-chunked or re-embedded later without asking the user to upload anything
 * again. That happens more often than it sounds: a better chunk size, a better
 * embedding model, or a dimension change all mean rebuilding every vector, and
 * a store that only kept the chunks would have thrown away the input.
 *
 * `status` drives the UI while ingestion runs. Embedding a long document takes
 * several seconds of provider round trips, so the row is written first and
 * filled in as chunks land.
 */
export const document = pgTable(
  "document",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** Where it came from: a filename, a URL, or "pasted". Shown in citations. */
    source: text("source").notNull().default("pasted"),
    mimeType: text("mime_type").notNull().default("text/plain"),
    content: text("content").notNull(),
    /** "pending" | "ready" | "failed" — ingestion state, not user intent. */
    status: text("status").notNull().default("pending"),
    /** Populated when `status` is "failed", so the UI can say what went wrong. */
    error: text("error"),
    chunkCount: integer("chunk_count").notNull().default(0),
    /** Which model produced the vectors, so a model change can be detected. */
    embeddingModel: text("embedding_model"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("document_user_idx").on(t.userId, t.enabled)],
);

/**
 * One embeddable passage of a document, with its vector.
 *
 * The vector width is fixed at DDL time — `vector(1536)` is a real column type,
 * not a blob — so it must match `EMBEDDING_DIMENSIONS` in `lib/rag/embed.ts`.
 *
 * The HNSW index is what makes this a vector *database* rather than a table of
 * floats. Without it every search is a sequential scan computing distance to
 * every row; with it, Postgres walks a navigable small-world graph and touches
 * a fraction of them. It is an *approximate* index: it trades a small chance of
 * missing a true nearest neighbour for orders of magnitude less work, which is
 * the right trade when the results are being read by a model that gets several
 * candidates anyway.
 *
 * The operator class must match the operator used in the query. This one is
 * built for cosine distance (`<=>`); a search written with `<->` (L2) would
 * silently ignore the index and scan.
 */
export const documentChunk = pgTable(
  "document_chunk",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    /** Denormalised from `document` so search filters by owner without a join. */
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Position within the document, so retrieved passages can be ordered. */
    ordinal: integer("ordinal").notNull().default(0),
    /** The Markdown heading trail above this passage, e.g. "Billing > Refunds". */
    heading: text("heading"),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("document_chunk_document_idx").on(t.documentId, t.ordinal),
    index("document_chunk_embedding_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
    // Keyword search over the same passages, for the hybrid half of retrieval.
    // Vectors miss exact tokens — error codes, product names, IDs — because
    // those carry little semantic weight; this index is what catches them.
    index("document_chunk_fts_idx").using(
      "gin",
      sql`to_tsvector('english', ${t.content})`,
    ),
  ],
);

/** Per-user preferences: custom instructions, default model, feature toggles. */
export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  /** ChatGPT-style "what should the model know about you". */
  aboutUser: text("about_user"),
  /** "How should the model respond" — tone, format, verbosity. */
  responseStyle: text("response_style"),
  defaultModel: text("default_model"),
  memoryEnabled: boolean("memory_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ *
 * Relations
 * ------------------------------------------------------------------ */

export const userRelations = relations(user, ({ many, one }) => ({
  chats: many(chat),
  memories: many(memory),
  skills: many(skill),
  documents: many(document),
  settings: one(userSettings, {
    fields: [user.id],
    references: [userSettings.userId],
  }),
}));

export const chatRelations = relations(chat, ({ one, many }) => ({
  user: one(user, { fields: [chat.userId], references: [user.id] }),
  messages: many(message),
}));

export const messageRelations = relations(message, ({ one }) => ({
  chat: one(chat, { fields: [message.chatId], references: [chat.id] }),
}));

export const memoryRelations = relations(memory, ({ one }) => ({
  user: one(user, { fields: [memory.userId], references: [user.id] }),
}));

export const skillRelations = relations(skill, ({ one }) => ({
  user: one(user, { fields: [skill.userId], references: [user.id] }),
}));

export const documentRelations = relations(document, ({ one, many }) => ({
  user: one(user, { fields: [document.userId], references: [user.id] }),
  chunks: many(documentChunk),
}));

export const documentChunkRelations = relations(documentChunk, ({ one }) => ({
  document: one(document, { fields: [documentChunk.documentId], references: [document.id] }),
}));

export type User = typeof user.$inferSelect;
export type Document = typeof document.$inferSelect;
export type DocumentChunk = typeof documentChunk.$inferSelect;
export type Skill = typeof skill.$inferSelect;
export type Chat = typeof chat.$inferSelect;
export type Message = typeof message.$inferSelect;
export type Memory = typeof memory.$inferSelect;
export type MemoryPack = typeof memoryPack.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;
