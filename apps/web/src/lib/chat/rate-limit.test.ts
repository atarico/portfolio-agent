import { describe, expect, it } from "vitest";

import { PUBLIC_ROUTE_BUDGET, SHARED_CLIENT_KEY, clientKeyFromHeaders, createRateLimiter } from "./rate-limit";

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

  it("prunes expired buckets from the map (size() reflects the prune)", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 5, windowMs: 1_000, now: () => now });

    limiter.check("a");
    now = 1_001; // past "a"'s window
    limiter.check("b");

    expect(limiter.size()).toBe(1);
  });

  it("caps the number of tracked keys", () => {
    const limiter = createRateLimiter({ limit: 5, windowMs: 10_000, maxKeys: 2, now: () => 0 });

    limiter.check("a");
    limiter.check("b");
    limiter.check("c");

    expect(limiter.size()).toBe(2);
  });

  it("evicts the oldest bucket first when over the key cap", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 10_000, maxKeys: 2, now: () => now });

    limiter.check("a"); // t0, oldest
    now = 1;
    limiter.check("b"); // t1
    now = 2;
    limiter.check("c"); // t2, over the cap: evicts "a" (the oldest)

    // "b" is still live and already spent its one allowed request.
    expect(limiter.check("b").allowed).toBe(false);
    // "a" was evicted, so its state was wiped: checking it again starts fresh.
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("moves a rolled-over bucket to the tail so pruning order stays correct", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 5, windowMs: 100, now: () => now });

    limiter.check("a"); // resetAt 100
    now = 50;
    limiter.check("b"); // resetAt 150

    now = 100; // "a"'s window has just elapsed: rolls over to resetAt 200
    limiter.check("a");

    now = 150; // "b"'s window has now elapsed too, "a"'s (rolled) has not
    limiter.check("c"); // triggers a prune pass

    // If rollover did not move "a" to the tail, it would still sit ahead of
    // "b" in Map iteration order and the head-based prune would stop at "a"
    // (not yet expired) without ever reaching "b".
    expect(limiter.size()).toBe(2); // only "a" (rolled) and "c" remain
  });
});

describe("PUBLIC_ROUTE_BUDGET", () => {
  it("is a fixed shape shared by both public routes", () => {
    // Triangulation skipped: structural constant, one possible value.
    expect(PUBLIC_ROUTE_BUDGET).toEqual({ limit: 20, windowMs: 10 * 60 * 1000, maxKeys: 10_000 });
  });
});

describe("clientKeyFromHeaders", () => {
  it("ignores forwarding headers entirely when proxy headers are untrusted, mapping every caller to one shared key", () => {
    const untrusted = {};
    expect(clientKeyFromHeaders(new Headers({ "x-forwarded-for": "203.0.113.9" }), untrusted)).toBe(SHARED_CLIENT_KEY);
    expect(clientKeyFromHeaders(new Headers({ "x-forwarded-for": "198.51.100.4, 10.0.0.1" }), untrusted)).toBe(
      SHARED_CLIENT_KEY,
    );
    expect(clientKeyFromHeaders(new Headers({ "x-real-ip": "192.0.2.7" }), untrusted)).toBe(SHARED_CLIENT_KEY);
    expect(clientKeyFromHeaders(new Headers(), untrusted)).toBe(SHARED_CLIENT_KEY);
  });

  it("only treats the exact string \"1\" as trusting proxy headers", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9" });
    expect(clientKeyFromHeaders(headers, { TRUST_PROXY_HEADERS: "true" })).toBe(SHARED_CLIENT_KEY);
    expect(clientKeyFromHeaders(headers, { TRUST_PROXY_HEADERS: "0" })).toBe(SHARED_CLIENT_KEY);
  });

  it("trusts the rightmost x-forwarded-for entry when proxy headers are trusted", () => {
    const trusted = { TRUST_PROXY_HEADERS: "1" };
    expect(clientKeyFromHeaders(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }), trusted)).toBe(
      "10.0.0.1",
    );
    expect(clientKeyFromHeaders(new Headers({ "x-forwarded-for": "198.51.100.4" }), trusted)).toBe("198.51.100.4");
  });

  it("falls back to x-real-ip, then the shared key, when trusted but x-forwarded-for is absent", () => {
    const trusted = { TRUST_PROXY_HEADERS: "1" };
    expect(clientKeyFromHeaders(new Headers({ "x-real-ip": "198.51.100.4" }), trusted)).toBe("198.51.100.4");
    expect(clientKeyFromHeaders(new Headers(), trusted)).toBe(SHARED_CLIENT_KEY);
  });
});
