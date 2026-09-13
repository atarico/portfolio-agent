export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  /** Injectable clock, mainly for tests. */
  now?: () => number;
}

export type RateLimitDecision =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number };

export interface RateLimiter {
  check(key: string): RateLimitDecision;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window, in-memory rate limiter.
 *
 * Demo-grade on purpose: state lives in the process, so on serverless each
 * instance counts separately and a cold start resets it. It still stops a
 * single client from looping on the endpoint. Swap for a shared store
 * (Redis, Upstash...) before exposing the chat to real traffic.
 */
export function createRateLimiter({ limit, windowMs, now = Date.now }: RateLimiterOptions): RateLimiter {
  const buckets = new Map<string, Bucket>();

  return {
    check(key) {
      const current = now();
      let bucket = buckets.get(key);

      if (!bucket || bucket.resetAt <= current) {
        bucket = { count: 0, resetAt: current + windowMs };
        buckets.set(key, bucket);
      }

      if (bucket.count >= limit) {
        return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - current) / 1000) };
      }

      bucket.count += 1;
      return { allowed: true, remaining: limit - bucket.count };
    },
  };
}

/** Best-effort client identity behind a proxy (Vercel sets x-forwarded-for). */
export function clientKeyFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}
