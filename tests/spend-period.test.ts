import { describe, expect, it } from "vitest";
import { periodHasElapsed, resetPeriod } from "@/lib/spend-period";

const DAY = 24 * 60 * 60 * 1000;

describe("periodHasElapsed", () => {
  it("is false before periodDays have passed", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const now = new Date(start.getTime() + 29 * DAY);
    expect(periodHasElapsed({ periodStart: start, periodDays: 30 }, now)).toBe(false);
  });

  it("is true exactly at periodDays", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const now = new Date(start.getTime() + 30 * DAY);
    expect(periodHasElapsed({ periodStart: start, periodDays: 30 }, now)).toBe(true);
  });

  it("is true well past periodDays", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const now = new Date(start.getTime() + 90 * DAY);
    expect(periodHasElapsed({ periodStart: start, periodDays: 30 }, now)).toBe(true);
  });

  it("respects a shorter, weekly period", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const now = new Date(start.getTime() + 8 * DAY);
    expect(periodHasElapsed({ periodStart: start, periodDays: 7 }, now)).toBe(true);
  });
});

describe("resetPeriod", () => {
  it("restarts the period from now, not from where the old one would have ended", () => {
    // A limit untouched for months must not "catch up" several elapsed
    // periods into one reset — it just starts fresh from whenever it was
    // next actually checked.
    const now = new Date("2026-06-01T12:00:00Z");
    expect(resetPeriod(now)).toEqual({ periodStart: now, spentCentsThisPeriod: 0 });
  });
});
