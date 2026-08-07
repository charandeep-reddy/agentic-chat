import "server-only";

import { generateText } from "ai";
import { TITLE_PROMPT } from "@/lib/prompts";
import { createProvider, UTILITY_MODEL } from "@/lib/provider";
import { updateChat } from "@/lib/db/queries";
import type { Chat } from "@/lib/db/schema";

const MAX_TITLE_LENGTH = 60;

/** Strips quotes, trailing punctuation and stray newlines from a model title. */
export function cleanTitle(raw: string): string {
  const first = raw.trim().split("\n")[0] ?? "";
  const unquoted = first.replace(/^["'`]+|["'`]+$/g, "").replace(/[.!?]+$/, "");
  return unquoted.trim().slice(0, MAX_TITLE_LENGTH);
}

/** Fallback used when the model call fails or is skipped. */
export function titleFromText(text: string): string {
  const condensed = text.replace(/\s+/g, " ").trim();
  if (condensed.length <= MAX_TITLE_LENGTH) return condensed || "New chat";
  return `${condensed.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`;
}

/**
 * Names a chat from its first message. Fire-and-forget: the caller does not
 * await it, because a slow title should never delay the answer. Only the
 * still-default title is overwritten, so a user rename always wins.
 */
export function generateTitleInBackground(opts: {
  chat: Chat;
  userId: string;
  apiKey: string;
  text: string;
}): void {
  const { chat, userId, apiKey, text } = opts;
  if (chat.title !== "New chat") return;
  if (!text.trim()) return;

  void (async () => {
    let title = titleFromText(text);
    try {
      const provider = createProvider(apiKey);
      const { text: generated, finishReason } = await generateText({
        model: provider(UTILITY_MODEL),
        system: TITLE_PROMPT,
        prompt: text.slice(0, 2000),
        // Generous for a handful of words: reasoning models spend most of this
        // budget thinking, and a `length` finish leaves `text` empty.
        maxOutputTokens: 512,
        temperature: 0.3,
      });
      const cleaned = cleanTitle(generated);
      // A truncated title is worse than the message text it came from.
      if (cleaned && finishReason !== "length") title = cleaned;
    } catch (error) {
      console.error("[title] generation failed, using the message text:", error);
    }
    try {
      await updateChat(chat.id, userId, { title });
    } catch (error) {
      console.error("[title] failed to save:", error);
    }
  })();
}
