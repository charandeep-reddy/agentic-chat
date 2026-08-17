import "server-only";

/**
 * Barrel for `src/lib/db/queries/*` — every call site imports from
 * `@/lib/db/queries` exactly as when this was one file, so splitting it by
 * domain (projects, chats, messages, memories, skills, packs, settings,
 * account) didn't touch a single import elsewhere in the app.
 *
 * `queries.ts` had grown to ~940 lines mixing all eight of those domains with
 * no sub-structure; the split is organizational only; a wildcard, not a
 * function of the file names. Cross-domain calls stay explicit imports
 * between the files themselves — see `ownedProjectId` in `shared.ts` (used by
 * `chats.ts` and `memories.ts`), `touchChat` (used by `messages.ts`), and
 * `createMemory` (used by `packs.ts`).
 */
export * from "./account";
export * from "./chats";
export * from "./memories";
export * from "./messages";
export * from "./packs";
export * from "./projects";
export * from "./settings";
export * from "./skills";

// Re-exported so any call site that already imports it from here keeps
// working, while the implementation stays free of this module's database
// imports — the browser mints a new chat's id and must not pull
// `node-postgres` in with it.
export { newId } from "@/lib/id";
