import { trustsProxyHeaders, type Env } from "@/lib/http/env";

export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  /** Caps tracked keys; the oldest (soonest to expire) buckets are evicted first. */
  maxKeys?: number;
  /** Injectable clock, mainly for tests. */
  now?: () => number;
}

export type RateLimitDecision =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number };

export interface RateLimiter {
  check(key: string): RateLimitDecision;
  /** Number of tracked keys right now — the eviction-observable seam for tests. */
  size(): number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const DEFAULT_MAX_KEYS = 10_000;

/** Shared budget for both public routes: same limits, but each route keeps its own limiter instance. */
export const PUBLIC_ROUTE_BUDGET = { limit: 20, windowMs: 10 * 60 * 1000, maxKeys: DEFAULT_MAX_KEYS } as const;

/**
 * Fixed-window, in-memory rate limiter.
 *
 * Demo-grade on purpose: state lives in the process, so on serverless each
 * instance counts separately and a cold start resets it. It still stops a
 * single client from looping on the endpoint. Swap for a shared store
 * (Redis, Upstash...) before exposing the chat to real traffic.
 *
 * The bucket map is bounded by `maxKeys` so an attacker spraying distinct
 * keys cannot grow it without limit. Both bounding operations rely on one
 * invariant: **Map iteration order equals ascending `resetAt`.** That holds
 * because every write that changes a bucket's `resetAt` (creation and
 * rollover) does `delete` then `set` — `Map.set` on an already-present key
 * updates its value in place without moving it, so skipping the `delete`
 * would leave a rolled-over bucket in its old (now stale) position and break
 * the ordering pruning and eviction rely on. A live bucket that is merely
 * read (not rolled over) is never re-set, so its position never moves.
 */
export function createRateLimiter({
  limit,
  windowMs,
  maxKeys = DEFAULT_MAX_KEYS,
  now = Date.now,
}: RateLimiterOptions): RateLimiter {
  const buckets = new Map<string, Bucket>();

  function peekHead(): [string, Bucket] | undefined {
    const head = buckets.entries().next();
    return head.done ? undefined : head.value;
  }

  /** Deletes expired buckets from the head while they are expired — O(1) amortized, each entry visited once. */
  function pruneExpired(current: number): void {
    let head = peekHead();
    while (head && head[1].resetAt <= current) {
      buckets.delete(head[0]);
      head = peekHead();
    }
  }

  /** Evicts the oldest (head) buckets first until back within the cap. The just-inserted key is always the tail. */
  function evictOldestOverCap(): void {
    let head = peekHead();
    while (head && buckets.size > maxKeys) {
      buckets.delete(head[0]);
      head = peekHead();
    }
  }

  return {
    check(key) {
      const current = now();
      pruneExpired(current);

      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= current) {
        buckets.delete(key);
        bucket = { count: 0, resetAt: current + windowMs };
        buckets.set(key, bucket);
      }

      evictOldestOverCap();

      if (bucket.count >= limit) {
        return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - current) / 1000) };
      }

      bucket.count += 1;
      return { allowed: true, remaining: limit - bucket.count };
    },
    size() {
      return buckets.size;
    },
  };
}

/** Returned for every caller when proxy headers are not trusted, or when trusted but absent. */
export const SHARED_CLIENT_KEY = "shared";

/**
 * Best-effort client identity behind a proxy. Trusts `x-forwarded-for` /
 * `x-real-ip` only when `env.TRUST_PROXY_HEADERS === "1"` (see
 * `trustsProxyHeaders`); otherwise every caller resolves to one shared key,
 * so absence of the trust signal is safe rather than fail-open. When
 * trusted, Vercel appends to and rewrites the tail of `x-forwarded-for` at
 * its edge for direct traffic, so the rightmost entry is the trustworthy
 * one — earlier entries can be attacker-supplied.
 */
export function clientKeyFromHeaders(headers: Headers, env: Env = process.env): string {
  if (!trustsProxyHeaders(env)) return SHARED_CLIENT_KEY;

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const entries = forwarded
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    const rightmost = entries.at(-1);
    if (rightmost) return rightmost;
  }

  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return SHARED_CLIENT_KEY;
}
