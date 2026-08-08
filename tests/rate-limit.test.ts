import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rateLimit, rateLimitResponse, resetRateLimits } from "@/lib/rate-limit";

function setEnv(vars: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

beforeEach(() => {
  resetRateLimits();
  setEnv({
    RATE_LIMIT_CHAT_PER_MINUTE: undefined,
    RATE_LIMIT_CHAT_CONCURRENT: undefined,
    RATE_LIMIT_MODELS_PER_MINUTE: undefined,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("rateLimit", () => {
  it("does nothing at all when unconfigured, so single-user deploys are unaffected", () => {
    for (let i = 0; i < 100; i++) {
      expect(rateLimit("chat", "u1").ok).toBe(true);
    }
  });

  it("caps requests per window and reports when to retry", () => {
    setEnv({ RATE_LIMIT_CHAT_PER_MINUTE: "3" });

    expect(rateLimit("chat", "u1").ok).toBe(true);
    expect(rateLimit("chat", "u1").ok).toBe(true);
    expect(rateLimit("chat", "u1").ok).toBe(true);

    const denied = rateLimit("chat", "u1");
    expect(denied.ok).toBe(false);
    if (denied.ok) return;
    expect(denied.reason).toBe("too_many_requests");
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
    expect(denied.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("budgets each user separately", () => {
    setEnv({ RATE_LIMIT_CHAT_PER_MINUTE: "1" });

    expect(rateLimit("chat", "u1").ok).toBe(true);
    expect(rateLimit("chat", "u1").ok).toBe(false);
    expect(rateLimit("chat", "u2").ok).toBe(true);
  });

  it("budgets each endpoint separately", () => {
    setEnv({ RATE_LIMIT_CHAT_PER_MINUTE: "1", RATE_LIMIT_MODELS_PER_MINUTE: "1" });

    expect(rateLimit("chat", "u1").ok).toBe(true);
    expect(rateLimit("chat", "u1").ok).toBe(false);
    expect(rateLimit("models", "u1").ok).toBe(true);
  });

  it("lets the window slide", () => {
    vi.useFakeTimers();
    setEnv({ RATE_LIMIT_CHAT_PER_MINUTE: "2" });

    expect(rateLimit("chat", "u1").ok).toBe(true);
    expect(rateLimit("chat", "u1").ok).toBe(true);
    expect(rateLimit("chat", "u1").ok).toBe(false);

    vi.advanceTimersByTime(61_000);
    expect(rateLimit("chat", "u1").ok).toBe(true);
  });

  it("caps concurrent streams, and frees the slot on release", () => {
    setEnv({ RATE_LIMIT_CHAT_CONCURRENT: "2" });

    const first = rateLimit("chat", "u1");
    const second = rateLimit("chat", "u1");
    expect(first.ok && second.ok).toBe(true);

    const third = rateLimit("chat", "u1");
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.reason).toBe("too_many_streams");

    if (first.ok) first.release();
    expect(rateLimit("chat", "u1").ok).toBe(true);
  });

  it("ignores a double release, which would otherwise inflate the budget", () => {
    setEnv({ RATE_LIMIT_CHAT_CONCURRENT: "1" });

    const held = rateLimit("chat", "u1");
    if (!held.ok) throw new Error("expected the first request to be allowed");
    held.release();
    held.release();
    held.release();

    // Exactly one slot should have come back, so a second concurrent stream is
    // still refused.
    const next = rateLimit("chat", "u1");
    expect(next.ok).toBe(true);
    expect(rateLimit("chat", "u1").ok).toBe(false);
  });

  it("reclaims a slot the caller never released", () => {
    vi.useFakeTimers();
    setEnv({ RATE_LIMIT_CHAT_CONCURRENT: "1" });

    expect(rateLimit("chat", "u1").ok).toBe(true);
    expect(rateLimit("chat", "u1").ok).toBe(false);

    // A stream that leaks its slot must not lock the user out forever; the
    // chat route's own maxDuration is 60s.
    vi.advanceTimersByTime(6 * 60_000);
    expect(rateLimit("chat", "u1").ok).toBe(true);
  });

  it("does not consume a concurrency slot when only the window is configured", () => {
    setEnv({ RATE_LIMIT_CHAT_PER_MINUTE: "5" });

    const first = rateLimit("chat", "u1");
    expect(first.ok).toBe(true);
    // No release call — nothing should be held, so the next four still pass.
    for (let i = 0; i < 4; i++) expect(rateLimit("chat", "u1").ok).toBe(true);
  });

  it("treats a nonsense env value as unset rather than blocking everything", () => {
    setEnv({ RATE_LIMIT_CHAT_PER_MINUTE: "not-a-number" });

    for (let i = 0; i < 20; i++) expect(rateLimit("chat", "u1").ok).toBe(true);
  });
});

describe("rateLimitResponse", () => {
  it("is a 429 carrying Retry-After", async () => {
    setEnv({ RATE_LIMIT_CHAT_PER_MINUTE: "1" });
    rateLimit("chat", "u1");
    const denied = rateLimit("chat", "u1");
    if (denied.ok) throw new Error("expected the second request to be denied");

    const res = rateLimitResponse(denied);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe(String(denied.retryAfterSeconds));

    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("too_many_requests");
    expect(body.message).toMatch(/try again/i);
  });
});
