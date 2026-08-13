export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}

/**
 * Ceiling on the text a tool hands back to the model.
 *
 * This is a token budget, not a safety limit. A tool result is stored in the
 * transcript and replayed into the prompt on every later turn of the
 * conversation, so a single large fetch is not paid once — it is paid on every
 * request for the life of that chat. At the old 100,000 it was around 25,000
 * tokens each, carried forever.
 *
 * 24,000 characters is roughly 6,000 tokens: comfortably more than any answer
 * quotes, and small enough that several fetches in one conversation stay
 * affordable. `truncated` tells the model it is seeing a prefix, so it can
 * narrow the request rather than guess at the rest.
 */
export const MAX_TEXT_RESPONSE = 24_000;
