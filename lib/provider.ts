import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * Any OpenAI-compatible endpoint works; the default is OpenCode Go. Point
 * MODEL_BASE_URL at OpenRouter, Together, Groq, or a local Ollama to swap it.
 */
export const BASE_URL = process.env.MODEL_BASE_URL ?? "https://opencode.ai/zen/go/v1";

export const DEFAULT_MODEL = process.env.DEFAULT_MODEL ?? "deepseek-v4-flash";

/** A cheap, fast model for background work like naming conversations. */
export const UTILITY_MODEL = process.env.UTILITY_MODEL ?? DEFAULT_MODEL;

export function createProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "model-provider",
    baseURL: BASE_URL,
    apiKey,
  });
}

export function resolveModelId(requested: unknown, fallback?: string | null): string {
  if (typeof requested === "string" && requested.trim() !== "") return requested.trim();
  if (fallback?.trim()) return fallback.trim();
  return DEFAULT_MODEL;
}
