/**
 * Per-user rate limiting, off unless configured.
 *
 * Two independent limits, because they fail in different ways:
 *
 * - **Requests per window** stops a script hammering an endpoint.
 * - **Concurrent streams** is the one that actually protects this app. Every
 *   in-flight chat request holds a connection from a pool capped at 10
 *   (`lib/db/index.ts`), so a handful of parallel streams from one user can
 *   starve everyone else regardless of how slowly they were started.
 *
 * State lives in memory, so on a multi-instance deployment each instance
 * counts its own traffic and the effective limit is `instances × limit`. That
 * is the honest trade: it needs no Redis, it cannot fail closed, and it still
 * bounds a single user's blast radius. Swap `buckets` for a shared store if a
 * deployment ever needs an exact global limit.
 */

export type LimitName = "chat" | "models" | "packInstall";

interface LimitConfig {
  /** Requests allowed per window. 0 disables the check. */
  perWindow: number;
  windowMs: number;
  /** Simultaneous in-flight requests allowed. 0 disables the check. */
  concurrent: number;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/**
 * Read lazily rather than at module load: `next build` evaluates modules
 * without the runtime environment, and a value captured then would be wrong.
 */
function configFor(name: LimitName): LimitConfig {
  switch (name) {
    case "chat":
      return {
        perWindow: envInt("RATE_LIMIT_CHAT_PER_MINUTE", 0),
        windowMs: 60_000,
        concurrent: envInt("RATE_LIMIT_CHAT_CONCURRENT", 0),
      };
    case "models":
      return {
        perWindow: envInt("RATE_LIMIT_MODELS_PER_MINUTE", 0),
        windowMs: 60_000,
        concurrent: 0,
      };
    case "packInstall":
      return {
        perWindow: envInt("RATE_LIMIT_PACK_INSTALL_PER_MINUTE", 0),
        windowMs: 60_000,
        concurrent: 0,
      };
  }
}

interface Bucket {
  /** Timestamps of recent requests, oldest first. */
  hits: number[];
  active: number;
}

const buckets = new Map<string, Bucket>();

/**
 * A stream that never releases its slot would lock the user out permanently,
 * and `maxDuration` on the chat route is 60s. Anything still held well past
 * that is a leak, not a long request.
 */
const SLOT_TTL_MS = 5 * 60_000;

interface ActiveSlot {
  key: string;
  expires: number;
}

const slots = new Set<ActiveSlot>();

function bucketFor(key: string): Bucket {
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { hits: [], active: 0 };
    buckets.set(key, bucket);
  }
  return bucket;
}

/** Drops expired hits and reclaims slots leaked by a request that never ended. */
function sweep(now: number): void {
  for (const slot of slots) {
    if (slot.expires > now) continue;
    slots.delete(slot);
    const bucket = buckets.get(slot.key);
    if (bucket && bucket.active > 0) bucket.active -= 1;
  }

  for (const [key, bucket] of buckets) {
    if (bucket.active === 0 && bucket.hits.length === 0) buckets.delete(key);
  }
}

export interface RateLimitDenied {
  ok: false;
  reason: "too_many_requests" | "too_many_streams";
  retryAfterSeconds: number;
  message: string;
}

export interface RateLimitAllowed {
  ok: true;
  /** Frees the concurrency slot. Safe to call more than once. */
  release: () => void;
}

export type RateLimitResult = RateLimitDenied | RateLimitAllowed;

/**
 * Records one request against a user's budget. The caller must call
 * `release()` when the work finishes — including on the error path, and for a
 * streaming response only once the stream itself is done.
 */
export function rateLimit(name: LimitName, userId: string): RateLimitResult {
  const config = configFor(name);
  if (config.perWindow === 0 && config.concurrent === 0) {
    return { ok: true, release: () => {} };
  }

  const now = Date.now();
  sweep(now);

  const key = `${name}:${userId}`;
  const bucket = bucketFor(key);

  if (config.perWindow > 0) {
    const cutoff = now - config.windowMs;
    // The window slides, so the oldest hit is what has to age out — reporting
    // a fixed window length here would tell the caller to wait too long.
    while (bucket.hits.length > 0 && bucket.hits[0] <= cutoff) bucket.hits.shift();

    if (bucket.hits.length >= config.perWindow) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((bucket.hits[0] + config.windowMs - now) / 1000),
      );
      return {
        ok: false,
        reason: "too_many_requests",
        retryAfterSeconds,
        message: `Too many requests. Try again in ${retryAfterSeconds}s.`,
      };
    }
  }

  if (config.concurrent > 0 && bucket.active >= config.concurrent) {
    return {
      ok: false,
      reason: "too_many_streams",
      retryAfterSeconds: 5,
      message:
        config.concurrent === 1
          ? "Another response is still generating. Wait for it to finish or stop it first."
          : `You already have ${config.concurrent} responses generating. Wait for one to finish.`,
    };
  }

  if (config.perWindow > 0) bucket.hits.push(now);

  let released = false;
  if (config.concurrent > 0) {
    bucket.active += 1;
    const slot: ActiveSlot = { key, expires: now + SLOT_TTL_MS };
    slots.add(slot);
    return {
      ok: true,
      release: () => {
        if (released) return;
        released = true;
        slots.delete(slot);
        if (bucket.active > 0) bucket.active -= 1;
      },
    };
  }

  return { ok: true, release: () => {} };
}

/** The 429 to hand straight back from a route handler. */
export function rateLimitResponse(denied: RateLimitDenied): Response {
  return Response.json(
    { error: denied.reason, message: denied.message },
    { status: 429, headers: { "Retry-After": String(denied.retryAfterSeconds) } },
  );
}

/** Test hook: drops all recorded state. */
export function resetRateLimits(): void {
  buckets.clear();
  slots.clear();
}
