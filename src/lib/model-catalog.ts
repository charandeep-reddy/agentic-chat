import { BASE_URL } from "./provider";
import type { ProviderId } from "./providers";

/** One selectable model, normalised across four unrelated response shapes. */
export interface ModelInfo {
  id: string;
  name: string;
  /** Input context window in tokens, or null when the provider doesn't say. */
  context: number | null;
}

export type CatalogResult =
  | { ok: true; models: ModelInfo[] }
  | { ok: false; error: "network" }
  | { ok: false; error: "provider"; status: number };

const TIMEOUT_MS = 10_000;

/** Anthropic pins its request/response shape to a dated version. */
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * OpenAI's `/v1/models` lists everything the key can reach — embeddings,
 * speech, images and moderation included — with no field saying which are
 * chat models. These prefixes and fragments are the families OpenAI documents
 * under *other* endpoints, so dropping them leaves a list you can actually
 * pick from.
 *
 * Deliberately a denylist, not an allowlist: anything unrecognised is kept, so
 * a model released tomorrow shows up rather than being filtered into
 * invisibility by a rule written today.
 */
const OPENAI_NON_CHAT = [
  "text-embedding",
  "text-moderation",
  "omni-moderation",
  "whisper",
  "tts-",
  "dall-e",
  "gpt-image",
  "sora",
  "babbage",
  "davinci",
  "-realtime",
  "-transcribe",
  "-tts",
];

function isChatModel(id: string): boolean {
  const lower = id.toLowerCase();
  return !OPENAI_NON_CHAT.some((fragment) => lower.includes(fragment));
}

/**
 * Sorted for a dropdown a human reads. Numeric collation matters more than it
 * looks: plain string order puts `gpt-5.4` before `gpt-5.11` and buries the
 * newest model in the middle of the list.
 */
function sorted(models: ModelInfo[]): ModelInfo[] {
  return models.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

/** A positive token count, or null. Providers use 0 for "unknown" here. */
function tokens(value: unknown): number | null {
  return typeof value === "number" && value > 0 ? value : null;
}

async function get(url: string, headers: Record<string, string>): Promise<Response> {
  return fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

/**
 * Lists the models one key can use.
 *
 * Every provider publishes this differently — different URL, different auth
 * header, different envelope, different name for the context window — so each
 * branch is written against that provider's own reference rather than a shared
 * abstraction that would fit none of them.
 */
export async function listModels(provider: ProviderId, apiKey: string): Promise<CatalogResult> {
  try {
    switch (provider) {
      case "custom":
        return await listOpenAIShaped(`${BASE_URL}/models`, apiKey, false);
      case "openai":
        return await listOpenAIShaped("https://api.openai.com/v1/models", apiKey, true);
      case "anthropic":
        return await listAnthropic(apiKey);
      case "google":
        return await listGoogle(apiKey);
    }
  } catch {
    // Timeout, DNS failure, TLS failure — anything that never became a
    // response. Distinct from a provider that answered with an error.
    return { ok: false, error: "network" };
  }
}

/**
 * OpenAI's list shape, shared with every OpenAI-compatible endpoint.
 *
 * `name` and `context_length` are not in OpenAI's own schema — the model
 * object there is just `{id, object, created, owned_by}` — but compatible
 * gateways such as OpenRouter add them, so they are read when present.
 */
async function listOpenAIShaped(
  url: string,
  apiKey: string,
  filterNonChat: boolean,
): Promise<CatalogResult> {
  const response = await get(url, { Authorization: `Bearer ${apiKey}` });
  if (!response.ok) return { ok: false, error: "provider", status: response.status };

  const data = (await response.json()) as {
    data?: Array<{ id?: string; name?: string; context_length?: number | null }>;
  };

  const models = (data.data ?? [])
    .filter((m): m is { id: string; name?: string; context_length?: number | null } =>
      typeof m.id === "string" && m.id !== "",
    )
    .filter((m) => !filterNonChat || isChatModel(m.id))
    .map((m) => ({ id: m.id, name: m.name ?? m.id, context: tokens(m.context_length) }));

  return { ok: true, models: sorted(models) };
}

/**
 * Anthropic's `/v1/models`. Every model it returns is a chat model, so there
 * is nothing to filter — but it needs the dated version header, and it
 * paginates at 20 unless asked for more (1000 is the documented maximum).
 */
async function listAnthropic(apiKey: string): Promise<CatalogResult> {
  const response = await get("https://api.anthropic.com/v1/models?limit=1000", {
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
  });
  if (!response.ok) return { ok: false, error: "provider", status: response.status };

  const data = (await response.json()) as {
    data?: Array<{ id?: string; display_name?: string; max_input_tokens?: number }>;
  };

  const models = (data.data ?? [])
    .filter((m): m is { id: string; display_name?: string; max_input_tokens?: number } =>
      typeof m.id === "string" && m.id !== "",
    )
    .map((m) => ({
      id: m.id,
      name: m.display_name ?? m.id,
      context: tokens(m.max_input_tokens),
    }));

  return { ok: true, models: sorted(models) };
}

/** Guard against following `nextPageToken` forever if a page ever repeats. */
const GOOGLE_MAX_PAGES = 5;

/**
 * Google's `/v1beta/models`.
 *
 * The key goes in `x-goog-api-key` rather than the `key` query parameter the
 * docs lead with — both authenticate, but a key in a URL ends up in proxy and
 * server logs, and this one belongs to the user.
 *
 * Ids come back as `models/gemini-…`; the generation API wants the bare name.
 * Embedding, image and speech models are filtered by capability rather than by
 * guessing at their names — `supportedGenerationMethods` says outright which
 * ones `generateContent` can be called on.
 */
async function listGoogle(apiKey: string): Promise<CatalogResult> {
  const models: ModelInfo[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < GOOGLE_MAX_PAGES; page++) {
    const url = new URL("https://generativelanguage.googleapis.com/v1beta/models");
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await get(url.toString(), { "x-goog-api-key": apiKey });
    if (!response.ok) return { ok: false, error: "provider", status: response.status };

    const data = (await response.json()) as {
      models?: Array<{
        name?: string;
        displayName?: string;
        inputTokenLimit?: number;
        supportedGenerationMethods?: string[];
      }>;
      nextPageToken?: string;
    };

    for (const model of data.models ?? []) {
      if (typeof model.name !== "string" || model.name === "") continue;
      if (!model.supportedGenerationMethods?.includes("generateContent")) continue;
      const id = model.name.replace(/^models\//, "");
      models.push({
        id,
        name: model.displayName ?? id,
        context: tokens(model.inputTokenLimit),
      });
    }

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return { ok: true, models: sorted(models) };
}
