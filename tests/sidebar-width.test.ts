import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  SIDEBAR_WIDTH_STORAGE,
  clampSidebarWidth,
  parseSidebarWidth,
} from "../src/lib/sidebar-width";

describe("sidebar width", () => {
  it("exports the storage key", () => {
    expect(SIDEBAR_WIDTH_STORAGE).toBe("agentic-chat.sidebar-width");
  });

  it("clamps width within limits", () => {
    expect(clampSidebarWidth(270)).toBe(270);
    expect(clampSidebarWidth(100)).toBe(MIN_SIDEBAR_WIDTH);
    expect(clampSidebarWidth(600)).toBe(MAX_SIDEBAR_WIDTH);
    expect(clampSidebarWidth(NaN)).toBe(DEFAULT_SIDEBAR_WIDTH);
    expect(clampSidebarWidth(Infinity)).toBe(DEFAULT_SIDEBAR_WIDTH);
  });

  it("parses stored strings and fallback values safely", () => {
    expect(parseSidebarWidth("320")).toBe(320);
    expect(parseSidebarWidth("150")).toBe(MIN_SIDEBAR_WIDTH);
    expect(parseSidebarWidth("500")).toBe(MAX_SIDEBAR_WIDTH);
    expect(parseSidebarWidth(null)).toBe(DEFAULT_SIDEBAR_WIDTH);
    expect(parseSidebarWidth(undefined)).toBe(DEFAULT_SIDEBAR_WIDTH);
    expect(parseSidebarWidth("invalid")).toBe(DEFAULT_SIDEBAR_WIDTH);
  });
});
