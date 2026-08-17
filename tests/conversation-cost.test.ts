import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { messageModel, messagePartial, messageUsage } from "@/components/chat/conversation-cost";

function messageWithMetadata(metadata: unknown): UIMessage {
  return { id: "m1", role: "assistant", parts: [], metadata } as UIMessage;
}

describe("messagePartial", () => {
  it("is true for a message a periodic save wrote mid-stream", () => {
    const message = messageWithMetadata({ partial: true });
    expect(messagePartial(message)).toBe(true);
  });

  it("is false once the final save has overwritten the metadata", () => {
    // The final write's metadata comes from `messageMetadata`'s `finish`
    // branch, which never includes `partial` — so a completed turn has none.
    const message = messageWithMetadata({ usage: { total: 100 }, model: "claude-opus-5" });
    expect(messagePartial(message)).toBe(false);
  });

  it("is false with no metadata at all", () => {
    const message = messageWithMetadata(undefined);
    expect(messagePartial(message)).toBe(false);
    expect(messageUsage(message)).toBeUndefined();
    expect(messageModel(message)).toBeUndefined();
  });
});
