import { DEFAULT_MODEL } from "./models";
import { KEY_STORAGE, MODEL_STORAGE, scopedKey } from "./storage-keys";

/**
 * The model providers the app can talk to.
 *
 * Client-safe on purpose. The settings panel, the chat header and the composer
 * all need to know which providers exist and what each one is called, while
 * `lib/provider.ts` — which holds base URLs and builds authenticated clients —
 * is only ever imported from routes.
 *
 * `custom` is any OpenAI-compatible endpoint, pointed at by `MODEL_BASE_URL`.
 * It is first and it is the default because it is what this app shipped with;
 * the three named providers were added around it, not in place of it.
 */

export const PROVIDER_IDS = ["custom", "anthropic", "openai", "google"] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export const DEFAULT_PROVIDER: ProviderId = "custom";

export interface ProviderInfo {
  id: ProviderId;
  /** Shown in the provider picker. */
  label: string;
  /** One line under the key field: which key this is and where it goes. */
  hint: string;
  /** Deep link to where the user creates a key. */
  keysUrl: string;
  /**
   * Placeholder for the key field, shaped like that provider's keys.
   *
   * A hint, never a validation rule — prefixes are a convention providers
   * change without notice, and rejecting a key on its first characters would
   * lock someone out of a key that works. The real check is the model list
   * request the panel makes on save, which asks the provider itself.
   */
  keyPlaceholder: string;
  /**
   * The model used until the user picks one from the live list.
   *
   * Each is a currently-served id taken from that provider's own reference —
   * a stale guess here is a 404 on someone's first message, which is the worst
   * possible first impression.
   */
  defaultModel: string;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  custom: {
    id: "custom",
    label: "OpenAI-compatible",
    hint: "Any OpenAI-compatible endpoint — OpenCode by default, or point MODEL_BASE_URL at OpenRouter, Together, Groq, or a local Ollama.",
    keysUrl: "https://opencode.ai/zen",
    // No fixed format: this is whatever the configured endpoint accepts.
    keyPlaceholder: "Your endpoint's API key",
    defaultModel: DEFAULT_MODEL,
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    hint: "An Anthropic API key. Billed to your Anthropic account.",
    keysUrl: "https://platform.claude.com/settings/keys",
    keyPlaceholder: "sk-ant-…",
    defaultModel: "claude-opus-5",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    hint: "An OpenAI API key. Billed to your OpenAI account.",
    keysUrl: "https://platform.openai.com/api-keys",
    keyPlaceholder: "sk-…",
    defaultModel: "gpt-5.4",
  },
  google: {
    id: "google",
    label: "Google Gemini",
    hint: "A Google AI Studio key. Billed to your Google account.",
    keysUrl: "https://aistudio.google.com/apikey",
    keyPlaceholder: "AIza…",
    defaultModel: "gemini-3.6-flash",
  },
};

export const PROVIDER_LIST: ProviderInfo[] = PROVIDER_IDS.map((id) => PROVIDERS[id]);

/**
 * Narrows an untrusted string to a provider id.
 *
 * Used on both sides of the wire: the client reads it out of localStorage and
 * the route reads it off a header, and neither source is trustworthy enough to
 * index the catalogue with directly.
 */
export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && (PROVIDER_IDS as readonly string[]).includes(value);
}

/** The provider id, or the default when the value is missing or unrecognised. */
export function toProviderId(value: unknown): ProviderId {
  return isProviderId(value) ? value : DEFAULT_PROVIDER;
}

/** localStorage name holding this provider's API key. */
export function keyStorageFor(provider: ProviderId): string {
  return scopedKey(KEY_STORAGE, provider);
}

/**
 * localStorage name holding this provider's selected model.
 *
 * Scoped per provider because a model id only means anything to the provider
 * that serves it: switching to Gemini while `claude-opus-5` is still selected
 * would send Google a model it has never heard of.
 */
export function modelStorageFor(provider: ProviderId): string {
  return scopedKey(MODEL_STORAGE, provider);
}

/**
 * Every localStorage name that could hold a key.
 *
 * Derived from the catalogue rather than listed by hand, so a provider added
 * later cannot be left behind by "clear all keys" — silently keeping a key
 * someone asked to delete is the worst way for that to fail.
 */
export function allKeyStorageNames(): string[] {
  return PROVIDER_IDS.map(keyStorageFor);
}

/**
 * The providers holding a key, given a way to read storage.
 *
 * The reader is injected so this stays a pure function: the browser passes
 * localStorage, and a test passes a plain object.
 */
export function providersWithStoredKey(read: (name: string) => string): ProviderId[] {
  return PROVIDER_IDS.filter((id) => read(keyStorageFor(id)) !== "");
}
