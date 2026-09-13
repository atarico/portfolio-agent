import { describe, expect, it, vi } from "vitest";

import type { RateLimitDecision, RateLimiter } from "@/lib/chat/rate-limit";

import { applyPublicGuards } from "./guards";

function allowingLimiter(): RateLimiter {
  return { check: vi.fn((): RateLimitDecision => ({ allowed: true, remaining: 10 })), size: () => 0 };
}

function denyingLimiter(): RateLimiter {
  return { check: vi.fn((): RateLimitDecision => ({ allowed: false, retryAfterSeconds: 30 })), size: () => 0 };
}

describe("applyPublicGuards", () => {
  it("returns null to continue when there is no authorizer and the limiter allows", () => {
    const limiter = allowingLimiter();

    const result = applyPublicGuards(new Request("http://test.local"), { limiter, env: {} });

    expect(result).toBeNull();
  });

  it("denies on the rate limit before the authorizer ever runs", () => {
    const limiter = denyingLimiter();
    const authorize = vi.fn(() => ({ ok: true }) as const);

    const result = applyPublicGuards(new Request("http://test.local"), { limiter, env: {}, authorize });

    expect(result).not.toBeNull();
    expect(result?.status).toBe(429);
    expect(authorize).not.toHaveBeenCalled();
  });

  it("calls the limiter before denying on auth", () => {
    const limiter = allowingLimiter();
    const authorize = vi.fn(() => ({
      ok: false as const,
      response: Response.json({ error: "Unauthorized.", code: "unauthorized" }, { status: 401 }),
    }));

    const result = applyPublicGuards(new Request("http://test.local"), { limiter, env: {}, authorize });

    expect(result?.status).toBe(401);
    expect(limiter.check).toHaveBeenCalledTimes(1);
  });

  it("passes through the authorizer's response unchanged when auth denies", async () => {
    const limiter = allowingLimiter();
    const denialBody = { error: "Unauthorized.", code: "unauthorized" as const };
    const authorize = vi.fn(() => ({ ok: false as const, response: Response.json(denialBody, { status: 401 }) }));

    const result = applyPublicGuards(new Request("http://test.local"), { limiter, env: {}, authorize });

    expect(result).not.toBeNull();
    await expect(result?.clone().json()).resolves.toEqual(denialBody);
  });
});
