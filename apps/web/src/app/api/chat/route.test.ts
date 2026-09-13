import { describe, expect, it, vi } from "vitest";

import { createRateLimiter, type RateLimitDecision, type RateLimiter } from "@/lib/chat/rate-limit";

// The chat route dispatches to a real model and a real MCP connection; this test only
// pins one wiring detail (the incoming request's `signal` reaching `streamText`), so
// the LLM and MCP layers are replaced with minimal stand-ins instead of exercised for real.
vi.mock("ai", () => ({
  convertToModelMessages: vi.fn(async (messages: unknown) => messages),
  isStepCount: vi.fn(() => "mock-stop-condition"),
  streamText: vi.fn(() => ({ stream: (async function* () {})() })),
  toUIMessageStream: vi.fn(({ stream }: { stream: unknown }) => stream),
  createUIMessageStreamResponse: vi.fn(() => new Response(null, { status: 200 })),
}));

vi.mock("@/lib/mcp/client", () => ({
  connectPortfolioMcp: vi.fn(async () => ({
    tools: async () => ({}),
    close: vi.fn(async () => undefined),
  })),
}));

vi.mock("@/lib/llm/provider", () => ({
  resolveModel: vi.fn(() => ({ provider: "google", modelId: "mock-model", model: {} })),
}));

import { streamText } from "ai";

import { createChatRouteHandler } from "./route";

function allowingLimiter(): RateLimiter {
  return { check: vi.fn((): RateLimitDecision => ({ allowed: true, remaining: 10 })), size: () => 0 };
}

function denyingLimiter(): RateLimiter {
  return {
    check: vi.fn((): RateLimitDecision => ({ allowed: false, retryAfterSeconds: 30 })),
    size: () => 0,
  };
}

function chatRequest(body: unknown, init: RequestInit = {}): Request {
  return new Request("http://test.local/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    ...init,
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

  it("passes the incoming request's abort signal to streamText, so Stop cancels server-side work too", async () => {
    const handler = createChatRouteHandler({ env: {}, limiter: allowingLimiter() });
    const controller = new AbortController();
    const request = chatRequest(
      { messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] },
      { signal: controller.signal },
    );

    // `request.signal` is asserted directly (not `controller.signal`): the Fetch spec has
    // `Request` compose an internal signal that follows the one passed to its constructor,
    // so they are behaviorally linked but not the same object.
    const response = await handler(request);

    expect(response.status).toBe(200);
    expect(streamText).toHaveBeenCalledTimes(1);
    const [options] = vi.mocked(streamText).mock.calls[0] as [{ abortSignal?: AbortSignal }];
    expect(options.abortSignal).toBe(request.signal);
    expect(controller.signal.aborted).toBe(false);
  });
});
