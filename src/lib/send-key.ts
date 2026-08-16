export const SEND_KEY_STORAGE = "agentic-chat.send-key";

/** Which key sends the message; the other always inserts a newline. */
export type SendKeyPreference = "enter" | "shift-enter";

export function isSendKeyPreference(value: unknown): value is SendKeyPreference {
  return value === "enter" || value === "shift-enter";
}
