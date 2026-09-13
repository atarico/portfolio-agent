import { timingSafeEqual } from "node:crypto";

import { isProduction, type Env } from "@/lib/http/env";
import { describeError } from "@/lib/http/errors";

export type McpAuthResult = { ok: true } | { ok: false; response: Response };

/**
 * Bearer authentication for the public MCP endpoint.
 *
 * Outside production, an unset MCP_AUTH_TOKEN leaves the endpoint open,
 * which is fine for a demo that holds no GitHub token or a token without
 * scopes. In production an unset token fails closed instead: the endpoint
 * refuses every request rather than silently staying open. Set the token
 * whenever the deployment holds credentials worth protecting.
 */
export function authorizeMcpRequest(headers: Headers, env: Env = process.env): McpAuthResult {
  const expected = env.MCP_AUTH_TOKEN?.trim();

  if (!expected) {
    if (isProduction(env)) {
      console.error("[mcp] MCP_AUTH_TOKEN is unset in production; refusing every request to /api/mcp.");
      return { ok: false, response: unconfiguredResponse(env) };
    }
    return { ok: true };
  }

  const presented = bearerToken(headers.get("authorization"));
  if (presented !== null && constantTimeEquals(presented, expected)) {
    return { ok: true };
  }

  return { ok: false, response: unauthorizedResponse(env) };
}

function unconfiguredResponse(env: Env): Response {
  return Response.json(describeError(undefined, { code: "endpoint_unconfigured", env }), { status: 503 });
}

function unauthorizedResponse(env: Env): Response {
  return Response.json(describeError(undefined, { code: "unauthorized", env }), {
    status: 401,
    headers: { "WWW-Authenticate": 'Bearer realm="portfolio-agent"' },
  });
}

function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const [scheme, ...rest] = header.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer" || rest.length !== 1) return null;
  return rest[0] ?? null;
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
