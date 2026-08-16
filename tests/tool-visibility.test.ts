import { describe, expect, it } from "vitest";
import {
  disabledToolsKey,
  parseDisabledTools,
  sanitizeDisabledTools,
  TOGGLEABLE_TOOLS,
} from "@/lib/tool-visibility";

describe("sanitizeDisabledTools", () => {
  it("keeps only recognised toggleable tool names", () => {
    expect(sanitizeDisabledTools(["render_chart", "not_a_tool", "fetch_url"])).toEqual([
      "render_chart",
      "fetch_url",
    ]);
  });

  it("rejects tools that are not in the toggleable set, e.g. memory tools", () => {
    expect(sanitizeDisabledTools(["save_memory", "load_skill"])).toEqual([]);
  });

  it("returns an empty array for non-array input", () => {
    expect(sanitizeDisabledTools("render_chart")).toEqual([]);
    expect(sanitizeDisabledTools(null)).toEqual([]);
    expect(sanitizeDisabledTools(undefined)).toEqual([]);
  });

  it("drops non-string entries", () => {
    expect(sanitizeDisabledTools(["render_chart", 42, null, {}])).toEqual(["render_chart"]);
  });
});

describe("parseDisabledTools", () => {
  it("parses and sanitizes valid JSON", () => {
    expect(parseDisabledTools('["render_chart","fetch_url"]')).toEqual(["render_chart", "fetch_url"]);
  });

  it("returns an empty array for an empty string", () => {
    expect(parseDisabledTools("")).toEqual([]);
  });

  it("tolerates malformed JSON instead of throwing", () => {
    expect(parseDisabledTools("{not json")).toEqual([]);
  });

  it("tolerates valid JSON that isn't an array", () => {
    expect(parseDisabledTools('{"foo":"bar"}')).toEqual([]);
  });
});

describe("disabledToolsKey", () => {
  it("scopes the storage key to the chat id", () => {
    expect(disabledToolsKey("chat_abc")).toBe("agentic-chat.chat.chat_abc.disabled-tools");
    expect(disabledToolsKey("chat_abc")).not.toBe(disabledToolsKey("chat_xyz"));
  });
});

describe("TOGGLEABLE_TOOLS", () => {
  it("does not include memory or skill tools", () => {
    const names = TOGGLEABLE_TOOLS.map((t) => t.name);
    expect(names).not.toContain("save_memory");
    expect(names).not.toContain("load_skill");
  });
});
