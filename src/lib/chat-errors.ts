/** Codes the route returns without a sentence of its own. */
const ERROR_TEXT: Record<string, string> = {
  unauthorized: "Your session expired. Sign in again.",
  bad_request: "The app sent a malformed request.",
  no_messages: "There was nothing to send.",
  missing_chat_id: "This chat has no id — reload the page.",
  too_many_requests: "Too many requests. Give it a moment.",
  too_many_streams: "Another response is still generating.",
};

/**
 * A failed response reaches us as an Error whose message is the raw body, which
 * for this API is JSON — so the banner was showing `{"error":"…"}` verbatim.
 * Prefer the sentence the route wrote, and only offer the Settings shortcut for
 * the failures Settings can actually fix.
 */
export function describeError(error: Error): { message: string; showSettings: boolean } {
  let parsed: { error?: string; message?: string };
  try {
    parsed = JSON.parse(error.message) as typeof parsed;
  } catch {
    return { message: error.message, showSettings: true };
  }

  const code = parsed.error ?? "";
  return {
    message: parsed.message ?? ERROR_TEXT[code] ?? error.message,
    showSettings: code === "missing_api_key" || code === "provider",
  };
}
