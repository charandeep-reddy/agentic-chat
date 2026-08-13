import { describe, expect, it } from "vitest";
import { decodeChatCursor, encodeChatCursor, type ChatCursor } from "@/lib/chat-cursor";

const CURSOR: ChatCursor = {
  pinned: false,
  updatedAt: "2026-08-13T09:15:00.000Z",
  id: "chat_abc123",
};

describe("chat cursor", () => {
  it("round-trips a position", () => {
    expect(decodeChatCursor(encodeChatCursor(CURSOR))).toEqual(CURSOR);
  });

  it("round-trips a pinned position", () => {
    // `pinned` is the first sort key, so losing it would restart paging in the
    // middle of the pinned block.
    const pinned = { ...CURSOR, pinned: true };
    expect(decodeChatCursor(encodeChatCursor(pinned))).toEqual(pinned);
  });

  it("is URL-safe, since it travels on a query string", () => {
    const encoded = encodeChatCursor(CURSOR);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encodeURIComponent(encoded)).toBe(encoded);
  });

  it("keeps the id, which is what breaks a timestamp tie", () => {
    // Two chats saved in the same millisecond straddle a page boundary. With
    // only the timestamp in the cursor one of them is never returned.
    const a = { ...CURSOR, id: "chat_a" };
    const b = { ...CURSOR, id: "chat_b" };
    expect(encodeChatCursor(a)).not.toBe(encodeChatCursor(b));
    expect(decodeChatCursor(encodeChatCursor(b))?.id).toBe("chat_b");
  });

  describe("decoding untrusted input", () => {
    // It arrives on a query string. Anything unusable means "first page",
    // which is a correct answer — never a 500.
    it("returns null rather than throwing", () => {
      for (const junk of [
        undefined,
        null,
        "",
        42,
        {},
        "not-base64!!",
        Buffer.from("not json").toString("base64url"),
        Buffer.from('{"not":"an array"}').toString("base64url"),
        Buffer.from("[1,2]").toString("base64url"),
      ]) {
        expect(decodeChatCursor(junk)).toBeNull();
      }
    });

    it("rejects a cursor whose fields are the wrong type", () => {
      const wrong = Buffer.from(JSON.stringify(["yes", "2026-08-13", "id"])).toString("base64url");
      expect(decodeChatCursor(wrong)).toBeNull();
    });

    it("rejects an unparseable timestamp, which would poison the comparison", () => {
      const bad = Buffer.from(JSON.stringify([false, "whenever", "chat_a"])).toString("base64url");
      expect(decodeChatCursor(bad)).toBeNull();
    });

    it("rejects an empty id", () => {
      const bad = Buffer.from(JSON.stringify([false, CURSOR.updatedAt, ""])).toString("base64url");
      expect(decodeChatCursor(bad)).toBeNull();
    });
  });
});
