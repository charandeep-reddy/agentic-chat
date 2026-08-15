import { describe, expect, it } from "vitest";
import { newId } from "@/lib/id";

describe("newId", () => {
  it("returns {prefix}_{24 lowercase hex chars} with no dashes", () => {
    expect(newId("chat")).toMatch(/^chat_[0-9a-f]{24}$/);
  });

  it("always mints 24 hex chars regardless of prefix", () => {
    for (const prefix of ["x", "chat", "a-very-long-prefix"]) {
      const match = newId(prefix).match(/_([0-9a-f]{24})$/);
      expect(match).not.toBeNull();
      expect(match![1]).toHaveLength(24);
    }
  });

  it("produces distinct ids for the same prefix", () => {
    expect(newId("tmp")).not.toBe(newId("tmp"));
  });

  it("keeps an underscore in the prefix as part of the shape", () => {
    expect(newId("my_chat")).toMatch(/^my_chat_[0-9a-f]{24}$/);
  });
});