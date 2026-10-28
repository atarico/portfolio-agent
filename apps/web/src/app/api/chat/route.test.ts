import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRateLimiter, type RateLimitDecision, type RateLimiter } from "@/lib/chat/rate-limit";

// The chat route dispatches to a real model and a real MCP connection; this test only
// pins one wiring detail (the incoming request's `signal` reaching `streamText`), so
// the LLM and MCP layers are replaced with minimal stand-ins instead of exercised for real.
vi.mock("ai", () => ({
  convertToModelMessages: vi.fn(async (messages: unknown) => messages),
  isStepCount: vi.fn(() => "mock-stop-condition"),
  pruneMessages: vi.fn(({ messages }: { messages: unknown[] }) => [...messages, "pruned"]),
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
  resolveModel: vi.fn(() => ({ chain: [{ provider: "google", modelId: "mock-model" }], model: {} })),
}));

import { isStepCount, pruneMessages, streamText, toUIMessageStream } from "ai";

import { MAX_AGENT_STEPS, MAX_OUTPUT_TOKENS } from "@/lib/agent/instructions";
import { ERROR_MESSAGES } from "@/lib/http/errors";
import { connectPortfolioMcp } from "@/lib/mcp/client";
import { resolveModel } from "@/lib/llm/provider";

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
  // Call counts below are absolute ("exactly once"), which only holds if each test
  // starts from a clean slate; without this they would silently depend on file order.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Tests below silence console.error with a spy; without this, the silence would
  // leak into later tests and hide a log that was supposed to be asserted.
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it("closes the MCP connection when the visitor presses Stop, since an aborted stream never reaches onEnd", async () => {
    const handler = createChatRouteHandler({ env: {}, limiter: allowingLimiter() });

    await handler(chatRequest({ messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] }));

    const connection = await vi.mocked(connectPortfolioMcp).mock.results.at(-1)?.value;
    const [options] = vi.mocked(streamText).mock.calls.at(-1) as [{ onAbort?: () => unknown }];
    expect(connection.close).not.toHaveBeenCalled();
    options.onAbort?.();
    expect(connection.close).toHaveBeenCalledTimes(1);
  });

  it("pins the agent step budget: isStepCount receives MAX_AGENT_STEPS and streamText's stopWhen is exactly its result", async () => {
    const handler = createChatRouteHandler({ env: {}, limiter: allowingLimiter() });
    const request = chatRequest({ messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] });

    await handler(request);

    expect(isStepCount).toHaveBeenCalledWith(MAX_AGENT_STEPS);

    const [options] = vi.mocked(streamText).mock.calls.at(-1) as [{ stopWhen?: unknown }];
    const lastIsStepCountResult = vi.mocked(isStepCount).mock.results.at(-1)?.value;
    expect(options.stopWhen).toBe(lastIsStepCountResult);
  });

  it("warns the operator when the agent answered only because it ran out of steps", async () => {
    // Hitting the cap is not an error: the model stops and answers with whatever it
    // gathered. Without this log nobody - operator or visitor - can tell a complete
    // answer from one that ran out of budget mid-thought.
    const logged = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const handler = createChatRouteHandler({ env: {}, limiter: allowingLimiter() });
    await handler(chatRequest({ messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] }));

    const [options] = vi.mocked(streamText).mock.calls.at(-1) as [
      { onFinish?: (event: { steps: unknown[] }) => void },
    ];
    options.onFinish?.({ steps: new Array(MAX_AGENT_STEPS).fill({}) });

    expect(logged).toHaveBeenCalledTimes(1);
    expect(String(logged.mock.calls[0][0])).toContain(String(MAX_AGENT_STEPS));
  });

  it("stays quiet when the agent finished within its step budget", async () => {
    const logged = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const handler = createChatRouteHandler({ env: {}, limiter: allowingLimiter() });
    await handler(chatRequest({ messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] }));

    const [options] = vi.mocked(streamText).mock.calls.at(-1) as [
      { onFinish?: (event: { steps: unknown[] }) => void },
    ];
    options.onFinish?.({ steps: new Array(MAX_AGENT_STEPS - 1).fill({}) });

    expect(logged).not.toHaveBeenCalled();
  });

  it("does not retry a failed model call, so a quota error costs one unit of the budget and not three", async () => {
    const handler = createChatRouteHandler({ env: {}, limiter: allowingLimiter() });

    await handler(chatRequest({ messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] }));

    const [options] = vi.mocked(streamText).mock.calls.at(-1) as [{ maxRetries?: number }];
    expect(options.maxRetries).toBe(0);
  });

  it("caps the output tokens of every model call, so one answer cannot run up the bill", async () => {
    const handler = createChatRouteHandler({ env: {}, limiter: allowingLimiter() });

    await handler(chatRequest({ messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] }));

    const [options] = vi.mocked(streamText).mock.calls.at(-1) as [{ maxOutputTokens?: number }];
    expect(options.maxOutputTokens).toBe(MAX_OUTPUT_TOKENS);
  });

  it("resolves the model chain from the injected env and logs every fallback", async () => {
    const logged = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const env = { LLM_PROVIDER: "groq,google" };
    const handler = createChatRouteHandler({ env, limiter: allowingLimiter() });

    await handler(chatRequest({ messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] }));

    const [passedEnv, fallback] = vi.mocked(resolveModel).mock.calls.at(-1) as [
      unknown,
      { onFallback: (failure: { model: string; error: unknown }, next: string) => void },
    ];
    expect(passedEnv).toBe(env);
    fallback.onFallback({ model: "openai/gpt-oss-120b", error: new Error("429 TPM") }, "gemini-3.6-flash");
    expect(String(logged.mock.calls[0]?.[0])).toMatch(/openai\/gpt-oss-120b.*429 TPM.*gemini-3\.6-flash/);
  });

  it("forces a text answer on the last step instead of letting the budget run out on tool calls", async () => {
    const handler = createChatRouteHandler({ env: {}, limiter: allowingLimiter() });

    await handler(chatRequest({ messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] }));

    const [options] = vi.mocked(streamText).mock.calls.at(-1) as [
      { prepareStep?: (event: { stepNumber: number }) => unknown },
    ];
    expect(options.prepareStep?.({ stepNumber: MAX_AGENT_STEPS - 1 })).toEqual({ toolChoice: "none" });
    expect(options.prepareStep?.({ stepNumber: 0 })).toBeUndefined();
  });

  it("asks every provider for low reasoning effort, which is what keeps tool steps fast", async () => {
    const handler = createChatRouteHandler({ env: {}, limiter: allowingLimiter() });

    await handler(chatRequest({ messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] }));

    const [options] = vi.mocked(streamText).mock.calls.at(-1) as [{ reasoning?: string }];
    expect(options.reasoning).toBe("low");
  });

  it("strips tool calls and reasoning from the replayed history before the model sees it", async () => {
    const handler = createChatRouteHandler({ env: {}, limiter: allowingLimiter() });

    await handler(chatRequest({ messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] }));

    expect(pruneMessages).toHaveBeenCalledWith(
      expect.objectContaining({ reasoning: "before-last-message", toolCalls: "before-last-message" }),
    );
    const [options] = vi.mocked(streamText).mock.calls.at(-1) as [{ messages?: unknown[] }];
    expect(options.messages).toBe(vi.mocked(pruneMessages).mock.results.at(-1)?.value);
  });

  it("tags the answer with the model that served it and how long it took", async () => {
    const handler = createChatRouteHandler({ env: {}, limiter: allowingLimiter() });

    await handler(chatRequest({ messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] }));

    const [options] = vi.mocked(toUIMessageStream).mock.calls.at(-1) as unknown as [
      { messageMetadata?: (event: { part: unknown }) => unknown },
    ];
    expect(options.messageMetadata?.({ part: { type: "finish-step", response: { modelId: "m" } } })).toEqual({
      model: "m",
    });
    expect(options.messageMetadata?.({ part: { type: "finish" } })).toEqual({ durationMs: expect.any(Number) });
  });

  it("rejects a malformed body with 400 invalid_request and surfaces the reason outside production", async () => {
    const handler = createChatRouteHandler({ env: {}, limiter: allowingLimiter() });

    // Last message must come from the user; this one is from the assistant.
    const response = await handler(
      chatRequest({ messages: [{ role: "assistant", parts: [{ type: "text", text: "hi" }] }] }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: ERROR_MESSAGES.invalid_request,
      code: "invalid_request",
    });
    // The request never reached the model: validation is a guard, not a filter.
    expect(streamText).not.toHaveBeenCalled();
  });

  it("returns 500 provider_unconfigured when the model cannot be resolved", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(resolveModel).mockImplementationOnce(() => {
      throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is missing");
    });
    const handler = createChatRouteHandler({ env: {}, limiter: allowingLimiter() });

    const response = await handler(
      chatRequest({ messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: ERROR_MESSAGES.provider_unconfigured,
      code: "provider_unconfigured",
    });
    // A misconfigured server is an operator problem: it must leave a trace.
    expect(logged).toHaveBeenCalledTimes(1);
    // No MCP connection is opened once configuration has already failed.
    expect(connectPortfolioMcp).not.toHaveBeenCalled();
  });

  it("returns 500 upstream_failure when the MCP connection cannot be established", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(connectPortfolioMcp).mockRejectedValueOnce(new Error("MCP transport closed"));
    const handler = createChatRouteHandler({ env: {}, limiter: allowingLimiter() });

    const response = await handler(
      chatRequest({ messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: ERROR_MESSAGES.upstream_failure,
      code: "upstream_failure",
    });
    expect(logged).toHaveBeenCalledTimes(1);
    expect(streamText).not.toHaveBeenCalled();
  });

  it("closes the MCP connection when dispatch fails after it was opened", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const close = vi.fn(async () => undefined);
    vi.mocked(connectPortfolioMcp).mockResolvedValueOnce({
      tools: async () => {
        throw new Error("tool listing failed");
      },
      close,
    } as unknown as Awaited<ReturnType<typeof connectPortfolioMcp>>);
    const handler = createChatRouteHandler({ env: {}, limiter: allowingLimiter() });

    const response = await handler(
      chatRequest({ messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] }),
    );

    expect(response.status).toBe(500);
    // The leak this pins: an open connection abandoned on the error path.
    expect(close).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledTimes(1);
  });
});
