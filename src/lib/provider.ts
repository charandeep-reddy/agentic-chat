import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { PROVIDERS, type ProviderId } from "./providers";

/**
 * Base URL for the `custom` provider. Any OpenAI-compatible endpoint works;
 * the default is OpenCode Zen. Point MODEL_BASE_URL at OpenRouter, Together,
 * Groq, or a local Ollama to swap it.
 *
 * The three named providers do not read this — each SDK package carries its
 * own base URL, and overriding one of them with this would silently send an
 * Anthropic key to whatever `custom` points at.
 */
export const BASE_URL = process.env.MODEL_BASE_URL ?? "https://opencode.ai/zen/go/v1";

export const DEFAULT_MODEL = process.env.DEFAULT_MODEL ?? "deepseek-v4-flash";

/**
 * A cheap, fast model for background work like naming conversations.
 *
 * Only consulted for the `custom` provider. The named providers each have
 * their own catalogue, and hard-coding a "cheap model" per provider means a
 * second set of model ids to keep current — one that fails as a silent 404 in
 * a fire-and-forget background call, where nobody would notice. Titles on
 * those providers use the model the conversation is already using instead.
 */
export const UTILITY_MODEL = process.env.UTILITY_MODEL ?? DEFAULT_MODEL;

/**
 * Builds the model for one request.
 *
 * Every provider gets its key per-call rather than from the environment: keys
 * belong to the user and arrive on the request, so there is deliberately no
 * process-wide client to accidentally fall back to.
 */
export function languageModel(
  provider: ProviderId,
  apiKey: string,
  modelId: string,
): LanguageModel {
  switch (provider) {
    case "anthropic":
      return createAnthropic({ apiKey })(modelId);
    case "openai":
      // The default factory is the Responses API, which is where OpenAI's
      // reasoning models expect to be called. `openai.chat()` would pin us to
      // Chat Completions and lose that.
      return createOpenAI({ apiKey })(modelId);
    case "google":
      return createGoogle({ apiKey })(modelId);
    case "custom":
      return createOpenAICompatible({ name: "model-provider", baseURL: BASE_URL, apiKey })(modelId);
  }
}

/**
 * The model a background title call should use.
 *
 * See `UTILITY_MODEL` for why only the custom provider gets a dedicated one.
 */
export function utilityModelId(provider: ProviderId, chatModelId: string): string {
  return provider === "custom" ? UTILITY_MODEL : chatModelId;
}

/**
 * Picks the model id for a request.
 *
 * The stored account default is only honoured for the custom provider. It is a
 * single column with no provider attached, so a value saved while on OpenAI
 * would otherwise be sent to Anthropic as a model it has never heard of; the
 * provider's own default is the safe answer in that case.
 */
export function resolveModelId(
  requested: unknown,
  fallback: string | null | undefined,
  provider: ProviderId = "custom",
): string {
  if (typeof requested === "string" && requested.trim() !== "") return requested.trim();
  if (provider === "custom") return fallback?.trim() || DEFAULT_MODEL;
  // The catalogue's defaults are compile-time constants because the client
  // reads them too; only the custom provider's is deployment-configurable,
  // which is why it comes from the env-aware constant above rather than here.
  return PROVIDERS[provider].defaultModel;
}
