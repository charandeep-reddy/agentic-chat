/**
 * The position of one row in the sidebar's ordering, as an opaque string.
 *
 * Keyset rather than `offset`: the list is ordered by recency, and recency
 * changes while you are reading it. With `offset` a chat that gets touched
 * between two page loads shifts every later row up, so the next page silently
 * skips one and duplicates another. A cursor names the row you stopped at, so
 * the second page continues from a fact rather than from a count — and it stays
 * O(log n) on the index instead of making the database count past everything it
 * already sent.
 *
 * The three fields are exactly the sort key: `pinned` first, then `updatedAt`,
 * then `id` to break ties. `id` is not decoration — without it two chats saved
 * in the same millisecond can straddle a page boundary and one of them never
 * appears.
 */
export interface ChatCursor {
  pinned: boolean;
  /** ISO 8601. Serialised as a string because it round-trips through JSON. */
  updatedAt: string;
  id: string;
}

export function encodeChatCursor(cursor: ChatCursor): string {
  const json = JSON.stringify([cursor.pinned, cursor.updatedAt, cursor.id]);
  return Buffer.from(json, "utf8").toString("base64url");
}

/**
 * Reads a cursor back, or null if it is unusable.
 *
 * Never throws. This arrives on a query string, so it is attacker-controlled:
 * anything malformed means "start from the beginning", which is a correct and
 * boring outcome. It is only a position in a list the caller is already
 * authorised to read — the user id is applied separately and is never taken
 * from here — so a forged cursor buys nothing but a different starting row.
 */
export function decodeChatCursor(raw: unknown): ChatCursor | null {
  if (typeof raw !== "string" || raw === "") return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!Array.isArray(parsed) || parsed.length !== 3) return null;
    const [pinned, updatedAt, id] = parsed;
    if (typeof pinned !== "boolean" || typeof updatedAt !== "string" || typeof id !== "string") {
      return null;
    }
    if (id === "" || Number.isNaN(Date.parse(updatedAt))) return null;
    return { pinned, updatedAt, id };
  } catch {
    return null;
  }
}
