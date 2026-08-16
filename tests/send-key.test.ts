import { describe, expect, it } from "vitest";
import { isSendKeyPreference } from "@/lib/send-key";

describe("isSendKeyPreference", () => {
  it("accepts the two valid preferences", () => {
    expect(isSendKeyPreference("enter")).toBe(true);
    expect(isSendKeyPreference("shift-enter")).toBe(true);
  });

  it("rejects anything else, including empty/stale storage", () => {
    expect(isSendKeyPreference("")).toBe(false);
    expect(isSendKeyPreference("Enter")).toBe(false);
    expect(isSendKeyPreference(null)).toBe(false);
    expect(isSendKeyPreference(undefined)).toBe(false);
  });
});
