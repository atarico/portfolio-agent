import { describe, expect, it, vi } from "vitest";

import { createRateLimiter, type RateLimitDecision, type RateLimiter } from "@/lib/chat/rate-limit";

import { createChatRouteHandler } from "./route";

function denyingLimiter(): RateLimiter {
  return {
    check: vi.fn((): RateLimitDecision => ({ allowed: false, retryAfterSeconds: 30 })),
    size: () => 0,
  };
}

function chatRequest(body: unknown): Request {
  return new Request("http://test.local/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("createChatRouteHandler", () => {
  it("rate limits through the shared guard floor before any request parsing", async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 10_000 });
    const handler = createChatRouteHandler({ env: {}, limiter });

    // First request passes the guard; it then fails body validation (empty
    // object has no `messages`), proving it reached parsing, not the guard.
    const first = await handler(chatRequest({}));
    expect(first.status).toBe(400);

    // Second request is denied by the limiter before parsing ever runs.
    const second = await handler(chatRequest({}));
    expect(second.status).toBe(429);
    expect(second.headers.get("Retry-After")).toBeTruthy();
  });

  it("runs the guard floor before dispatch: a denying limiter blocks the request", async () => {
    const handler = createChatRouteHandler({ env: {}, limiter: denyingLimiter() });

    const response = await handler(chatRequest({ messages: [] }));

    expect(response.status).toBe(429);
  });
});
