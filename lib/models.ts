/**
 * Client-safe model constants. `lib/provider.ts` is server-only because it
 * carries the base URL and builds authenticated clients; the UI needs just
 * this default to label the composer before settings load.
 */
export const DEFAULT_MODEL = "deepseek-v4-flash";
