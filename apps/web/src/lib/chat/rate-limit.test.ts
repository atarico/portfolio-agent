import { describe, expect, it } from "vitest";

import { clientKeyFromHeaders, createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  it("allows up to `limit` requests per window and then denies with a retry hint", () => {
    let now = 1_000;
    const limiter = createRateLimiter({ limit: 3, windowMs: 10_000, now: () => now });

    expect(limiter.check("a")).toEqual({ allowed: true, remaining: 2 });
    expect(limiter.check("a")).toEqual({ allowed: true, remaining: 1 });
    expect(limiter.check("a")).toEqual({ allowed: true, remaining: 0 });

    now = 4_000;
    const denied = limiter.check("a");
    expect(denied.allowed).toBe(false);
    if (denied.allowed) return;
    expect(denied.retryAfterSeconds).toBe(7);
  });

  it("resets after the window and keeps keys independent", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 1_000, now: () => now });

    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("b").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);

    now = 1_000;
    expect(limiter.check("a").allowed).toBe(true);
  });
});

describe("clientKeyFromHeaders", () => {
  it("prefers the first x-forwarded-for entry, then x-real-ip, then a shared fallback", () => {
    expect(clientKeyFromHeaders(new Headers({ "x-forwarded-for": " 203.0.113.9 , 10.0.0.1" }))).toBe(
      "203.0.113.9",
    );
    expect(clientKeyFromHeaders(new Headers({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
    expect(clientKeyFromHeaders(new Headers())).toBe("unknown");
  });
});
