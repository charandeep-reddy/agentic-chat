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
  /**
   * Added by better-auth's `admin` plugin (registered in `lib/auth.ts`),
   * unused unless `ORG_MANAGED_KEYS=true` — see `managed-keys.ts`. `banned`
   * and its two companions are the plugin's, kept even though this app
   * doesn't build a ban flow on top of them yet: the plugin's own database
   * hooks read and write all four, and a column it expects but can't find
   * fails the query rather than degrading gracefully.
   */
  role: text("role").notNull().default("user"),
  banned: boolean("banned").notNull().default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
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
    /** better-auth `admin` plugin: set while an admin is impersonating this session. */
    impersonatedBy: text("impersonated_by"),
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

/**
 * A named group of conversations that share context — instructions and, later,
 * reference material.
 *
 * The grouping is deliberately one level deep and non-hierarchical. A tree of
 * projects would need a path, a move operation and a cycle check, and the thing
 * people actually reach for is "my work chats" versus "everything else".
 */
export const project = pgTable(
  "project",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Shown under the name in the picker; never sent to the model. */
    description: text("description"),
    /**
     * Custom instructions for every chat in this project, layered over the
     * account-wide ones in `buildSystemPrompt`.
     */
    instructions: text("instructions"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("project_user_idx").on(t.userId, t.updatedAt.desc())],
);

/** A conversation. Messages hang off it; `shareId` makes it publicly readable. */
export const chat = pgTable(
  "chat",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New chat"),
    /**
     * Null for an ungrouped chat, which is most of them.
     *
     * `set null` rather than `cascade`: deleting a project is tidying up a
     * grouping, and it must not destroy the conversations inside it. They fall
     * back into the ungrouped list, where they can be reassigned.
     */
    projectId: text("project_id").references(() => project.id, { onDelete: "set null" }),
    model: text("model"),
    pinned: boolean("pinned").notNull().default(false),
    /** Non-null once the chat has been shared; the public link key. */
    shareId: text("share_id").unique(),
    sharedAt: timestamp("shared_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("chat_user_updated_idx").on(t.userId, t.updatedAt),
    index("chat_title_idx").on(t.title),
    // Trigram, because sidebar search is `ILIKE '%q%'` and a leading wildcard
    // can use no btree — the plain title index above could only ever be a
    // sequential scan with a filter. Needs the pg_trgm extension, enabled by
    // the migration that creates this.
    index("chat_title_trgm_idx").using("gin", sql`${t.title} gin_trgm_ops`),
    // Exactly the sidebar's sort order, so a page is an index seek to the
    // cursor plus a scan of one page — not a scan of the user's whole history
    // followed by a sort. `chat_user_updated_idx` cannot serve it: it lacks
    // `pinned`, so the ordering had to be re-derived on every page.
    index("chat_user_list_idx").on(t.userId, t.pinned.desc(), t.updatedAt.desc(), t.id.desc()),
    // A project's chat list is the same keyset query with one more equality at
    // the front. Without this it would seek `chat_user_list_idx` and then throw
    // away every chat belonging to a different project — fine at ten projects,
    // not at a hundred conversations spread across them.
    index("chat_project_list_idx").on(
      t.userId,
      t.projectId,
      t.pinned.desc(),
      t.updatedAt.desc(),
      t.id.desc(),
    ),
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
  (t) => [
    index("message_chat_ordinal_idx").on(t.chatId, t.ordinal),
    // The expensive half of search. Matching a chat by its message text ran
    // `parts::text ILIKE '%q%'` as a correlated subquery, so every search read
    // every message body of every candidate chat. This makes that predicate an
    // index scan. Indexing the jsonb cast is allowed because the cast is
    // immutable — verified against Postgres, not assumed.
    index("message_parts_trgm_idx").using("gin", sql`(${t.parts}::text) gin_trgm_ops`),
  ],
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
    /**
     * Which project this memory belongs to, or null for an account-wide one.
     *
     * The scoping is one-directional: a chat inside a project reads both its own
     * project's memories and the account-wide ones, while a chat outside every
     * project reads only the account-wide ones. So work context never surfaces
     * in a personal chat, and a project chat does not lose the model's grasp of
     * who the user is.
     *
     * `cascade`, unlike `chat.projectId`: a memory saved inside a project is
     * only meaningful in that context, and leaving it behind unscoped would
     * promote it to account-wide — the one direction the scoping exists to
     * prevent.
     */
    projectId: text("project_id").references(() => project.id, { onDelete: "cascade" }),
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
  (t) => [
    index("memory_user_idx").on(t.userId, t.enabled),
    // Every prompt build reads "this project's memories plus the unscoped
    // ones", which is a range over this index rather than a scan of everything
    // the user has ever remembered.
    index("memory_project_idx").on(t.userId, t.projectId, t.enabled),
  ],
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
 * Managed mode
 *
 * Unused unless the deployment sets `ORG_MANAGED_KEYS=true` — see
 * `lib/managed-keys.ts` and the route branch in `app/api/chat/route.ts`. One
 * self-hosted instance is one company, so there is deliberately no
 * organization id anywhere here: `managedProviderKey` is a flat one-row-per-
 * provider table, not scoped to a tenant that doesn't exist in this model.
 * ------------------------------------------------------------------ */

/** An org-paid provider key, encrypted at rest. The admin panel writes this; only the server ever reads it. */
export const managedProviderKey = pgTable("managed_provider_key", {
  provider: text("provider").primaryKey(),
  encryptedKey: text("encrypted_key").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * One employee's spend cap against the org's managed keys.
 *
 * `limitCents: null` means unlimited — the admin's own account, typically.
 * The period resets lazily: whichever request next touches this row after
 * `periodStart + periodDays` has passed zeroes `spentCentsThisPeriod` and
 * bumps `periodStart`, rather than a cron job doing it on a schedule.
 */
export const spendLimit = pgTable("spend_limit", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  limitCents: integer("limit_cents"),
  periodDays: integer("period_days").notNull().default(30),
  periodStart: timestamp("period_start").notNull().defaultNow(),
  spentCentsThisPeriod: integer("spent_cents_this_period").notNull().default(0),
});

/* ------------------------------------------------------------------ *
 * Relations
 * ------------------------------------------------------------------ */

export const userRelations = relations(user, ({ many, one }) => ({
  chats: many(chat),
  memories: many(memory),
  skills: many(skill),
  projects: many(project),
  settings: one(userSettings, {
    fields: [user.id],
    references: [userSettings.userId],
  }),
}));

export const projectRelations = relations(project, ({ one, many }) => ({
  user: one(user, { fields: [project.userId], references: [user.id] }),
  chats: many(chat),
  memories: many(memory),
}));

export const chatRelations = relations(chat, ({ one, many }) => ({
  user: one(user, { fields: [chat.userId], references: [user.id] }),
  project: one(project, { fields: [chat.projectId], references: [project.id] }),
  messages: many(message),
}));

export const messageRelations = relations(message, ({ one }) => ({
  chat: one(chat, { fields: [message.chatId], references: [chat.id] }),
}));

export const memoryRelations = relations(memory, ({ one }) => ({
  user: one(user, { fields: [memory.userId], references: [user.id] }),
  project: one(project, { fields: [memory.projectId], references: [project.id] }),
}));

export const skillRelations = relations(skill, ({ one }) => ({
  user: one(user, { fields: [skill.userId], references: [user.id] }),
}));

export type User = typeof user.$inferSelect;
export type Project = typeof project.$inferSelect;
export type Skill = typeof skill.$inferSelect;
export type Chat = typeof chat.$inferSelect;
export type Message = typeof message.$inferSelect;
export type Memory = typeof memory.$inferSelect;
export type MemoryPack = typeof memoryPack.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;
export type ManagedProviderKey = typeof managedProviderKey.$inferSelect;
export type SpendLimit = typeof spendLimit.$inferSelect;
