import { describe, expect, it } from "vitest";
import { KEY_STORAGE, MODEL_STORAGE, scopedKey } from "@/lib/storage-keys";

describe("scopedKey", () => {
  it("keeps the default provider's names unsuffixed", () => {
    // Browsers that stored a key before providers existed still hold it under
    // the bare name; moving it would silently orphan it.
    expect(scopedKey(KEY_STORAGE, "custom")).toBe(KEY_STORAGE);
    expect(scopedKey(MODEL_STORAGE, "custom")).toBe(MODEL_STORAGE);
  });

  it("suffixes every other provider", () => {
    expect(scopedKey(KEY_STORAGE, "anthropic")).toBe("agentic-chat.key.anthropic");
    expect(scopedKey(MODEL_STORAGE, "openai")).toBe("agentic-chat.model.openai");
    expect(scopedKey(KEY_STORAGE, "google")).toBe("agentic-chat.key.google");
  });

  it("treats an empty-string provider like the default", () => {
    // `getStorage` returns "" for a missing entry, so a blank provider id must
    // resolve to the unsuffixed name rather than inventing a `.`-suffixed one.
    expect(scopedKey(KEY_STORAGE, "")).toBe(KEY_STORAGE);
    expect(scopedKey(MODEL_STORAGE, "")).toBe(MODEL_STORAGE);
  });
});