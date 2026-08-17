import { describe, expect, it } from "vitest";
import { describeError } from "@/lib/chat-errors";

describe("describeError", () => {
  it("uses the route's own message when the body carries one", () => {
    const error = new Error(JSON.stringify({ error: "bad_request", message: "Custom explanation." }));
    expect(describeError(error)).toEqual({ message: "Custom explanation.", showSettings: false });
  });

  it("falls back to the known sentence for a bare error code", () => {
    const error = new Error(JSON.stringify({ error: "too_many_requests" }));
    expect(describeError(error)).toEqual({
      message: "Too many requests. Give it a moment.",
      showSettings: false,
    });
  });

  it("falls back to the raw message for an unrecognised code with no message", () => {
    const error = new Error(JSON.stringify({ error: "some_new_code" }));
    expect(describeError(error).message).toBe(error.message);
  });

  it("shows the Settings shortcut only for key/provider failures", () => {
    expect(describeError(new Error(JSON.stringify({ error: "missing_api_key" }))).showSettings).toBe(true);
    expect(describeError(new Error(JSON.stringify({ error: "provider" }))).showSettings).toBe(true);
    expect(describeError(new Error(JSON.stringify({ error: "bad_request" }))).showSettings).toBe(false);
  });

  it("treats non-JSON error text as the message itself, with Settings offered", () => {
    const error = new Error("Failed to fetch");
    expect(describeError(error)).toEqual({ message: "Failed to fetch", showSettings: true });
  });
});
