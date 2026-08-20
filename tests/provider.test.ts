import { describe, expect, it } from "vitest";
import { UTILITY_MODEL, utilityModelId } from "@/lib/provider";

/**
 * Background calls (like title generation in src/lib/title.ts) use `utilityModelId`
 * to select a model. Only the `custom` provider gets routed to `UTILITY_MODEL`;
 * named providers (Anthropic, OpenAI, Google) intentionally reuse the active chat
 * model to avoid hardcoded IDs that could 404 in silent background jobs.
 */
describe("utilityModelId", () => {
  it("routes the custom provider to UTILITY_MODEL", () => {
    expect(utilityModelId("custom", "custom-chat-model")).toBe(UTILITY_MODEL);
    expect(utilityModelId("custom", "gpt-4o")).toBe(UTILITY_MODEL);
    expect(utilityModelId("custom", "")).toBe(UTILITY_MODEL);
  });

  it("reuses the conversation's chat model for Anthropic", () => {
    expect(utilityModelId("anthropic", "claude-opus-5")).toBe("claude-opus-5");
    expect(utilityModelId("anthropic", "claude-3-5-sonnet-latest")).toBe("claude-3-5-sonnet-latest");
  });

  it("reuses the conversation's chat model for OpenAI", () => {
    expect(utilityModelId("openai", "gpt-4o")).toBe("gpt-4o");
    expect(utilityModelId("openai", "o3-mini")).toBe("o3-mini");
  });

  it("reuses the conversation's chat model for Google", () => {
    expect(utilityModelId("google", "gemini-2.5-flash")).toBe("gemini-2.5-flash");
    expect(utilityModelId("google", "gemini-2.5-pro")).toBe("gemini-2.5-pro");
  });
});
