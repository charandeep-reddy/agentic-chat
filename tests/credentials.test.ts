import { describe, expect, it } from "vitest";
import {
  authErrorMessage,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  validateEmail,
  validateName,
  validatePassword,
} from "@/lib/credentials";

describe("validateEmail", () => {
  it("accepts ordinary addresses", () => {
    expect(validateEmail("ada@example.com")).toBeNull();
    expect(validateEmail("ada+chat@sub.example.co.uk")).toBeNull();
  });

  it("ignores surrounding whitespace", () => {
    expect(validateEmail("  ada@example.com  ")).toBeNull();
  });

  it("rejects empty and malformed input", () => {
    expect(validateEmail("")).toMatch(/enter your email/i);
    expect(validateEmail("   ")).toMatch(/enter your email/i);
    expect(validateEmail("ada")).not.toBeNull();
    expect(validateEmail("ada@example")).not.toBeNull();
    expect(validateEmail("ada @example.com")).not.toBeNull();
  });
});

describe("validatePassword", () => {
  it("accepts anything within the length bounds", () => {
    expect(validatePassword("a".repeat(MIN_PASSWORD_LENGTH))).toBeNull();
    expect(validatePassword("a".repeat(MAX_PASSWORD_LENGTH))).toBeNull();
  });

  it("rejects passwords outside them", () => {
    expect(validatePassword("")).toMatch(/enter a password/i);
    expect(validatePassword("a".repeat(MIN_PASSWORD_LENGTH - 1))).toMatch(/at least/i);
    expect(validatePassword("a".repeat(MAX_PASSWORD_LENGTH + 1))).toMatch(/under/i);
  });
});

describe("validateName", () => {
  it("requires something other than whitespace", () => {
    expect(validateName("Ada")).toBeNull();
    expect(validateName("   ")).not.toBeNull();
  });

  it("measures length after trimming", () => {
    expect(validateName(` ${"a".repeat(80)} `)).toBeNull();
    expect(validateName("a".repeat(81))).toMatch(/under/i);
  });
});

describe("authErrorMessage", () => {
  it("rewrites codes a user can act on", () => {
    expect(authErrorMessage({ code: "INVALID_EMAIL_OR_PASSWORD" })).toMatch(/don't match/i);
    expect(authErrorMessage({ code: "USER_ALREADY_EXISTS" })).toMatch(/sign in instead/i);
  });

  it("keeps the original message for unknown codes", () => {
    expect(authErrorMessage({ code: "SOMETHING_ELSE", message: "Rate limited" })).toBe(
      "Rate limited",
    );
  });

  it("falls back when there is nothing useful to show", () => {
    expect(authErrorMessage({})).toMatch(/something went wrong/i);
  });
});
