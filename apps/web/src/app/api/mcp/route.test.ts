import { createMCPClient } from "@ai-sdk/mcp";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { describe, expect, it, vi } from "vitest";

import { createRateLimiter, type RateLimitDecision, type RateLimiter } from "@/lib/chat/rate-limit";
import type { Env } from "@/lib/http/env";
import { authorizeMcpRequest } from "@/lib/mcp/auth";

import { createMcpRouteHandler, portfolioServerFor } from "./route";

function allowingLimiter(): RateLimiter {
  return { check: vi.fn((): RateLimitDecision => ({ allowed: true, remaining: 10 })) };
}

function denyingLimiter(): RateLimiter {
  return { check: vi.fn((): RateLimitDecision => ({ allowed: false, retryAfterSeconds: 30 })) };
}

/** A minimal, real MCP `initialize` JSON-RPC call: the cheapest request that reaches the server factory. */
function initializeRequest(): Request {
  return new Request("http://test.local/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2026-07-28", capabilities: {}, clientInfo: { name: "test", version: "1.0" } },
    }),
  });
}

describe("route module resolution", () => {
  it("resolves the @/ path alias", () => {
    expect(typeof authorizeMcpRequest).toBe("function");
  });
});

describe("createMcpRouteHandler", () => {
  it("refuses in production without MCP_AUTH_TOKEN, without ever constructing a server", async () => {
    const createServer = vi.fn();
    const handler = createMcpRouteHandler({
      env: { NODE_ENV: "production" },
      limiter: allowingLimiter(),
      createServer,
    });

    const response = await handler(initializeRequest());

    expect(response.status).toBe(503);
    expect(createServer).not.toHaveBeenCalled();
  });

  it("rate limits before dispatching to the MCP handler", async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 10_000 });
    const createServer = vi.fn((env: Env) => portfolioServerFor(env));
    const handler = createMcpRouteHandler({ env: {}, limiter, createServer });

    const first = await handler(initializeRequest());
    expect(first.status).toBe(200);
    expect(createServer).toHaveBeenCalledTimes(1);

    const second = await handler(initializeRequest());
    expect(second.status).toBe(429);
    expect(second.headers.get("Retry-After")).toBeTruthy();
    expect(createServer).toHaveBeenCalledTimes(1);
  });

  it.each(["GET", "POST", "DELETE"] as const)(
    "runs guards before dispatch on %s: a denying limiter blocks it and the server is never constructed",
    async (method) => {
      const createServer = vi.fn();
      const handler = createMcpRouteHandler({ env: {}, limiter: denyingLimiter(), createServer });

      const response = await handler(new Request("http://test.local/api/mcp", { method }));

      expect(response.status).toBe(429);
      expect(createServer).not.toHaveBeenCalled();
    },
  );

  it("passes the env to the server factory as its only argument", async () => {
    const env = { GITHUB_TOKEN: "server-token" };
    const createServer = vi.fn((receivedEnv: Env) => portfolioServerFor(receivedEnv));
    const handler = createMcpRouteHandler({ env, limiter: allowingLimiter(), createServer });

    await handler(initializeRequest());

    expect(createServer).toHaveBeenCalledTimes(1);
    expect(createServer.mock.calls[0]).toEqual([env]);
  });
});

describe("portfolioServerFor", () => {
  it("builds the GitHub adapter from the env token only, never an inbound bearer", async () => {
    const recordingFetch = vi.fn(
      async () => new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } }),
    );
    // MCP_AUTH_TOKEN stands in for a value an inbound bearer could equal; it must never reach the adapter.
    const env = { GITHUB_TOKEN: "server-token", MCP_AUTH_TOKEN: "inbound-bearer-value" };

    const server = portfolioServerFor(env, recordingFetch as unknown as typeof fetch);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = await createMCPClient({ transport: clientTransport });

    const tools = await client.tools();
    await tools.list_repos.execute({}, { toolCallId: "1", messages: [], context: undefined });
    await client.close();

    expect(recordingFetch).toHaveBeenCalledTimes(1);
    const [, init] = recordingFetch.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer server-token");
    expect(headers.Authorization).not.toContain("inbound-bearer-value");
  });
});
