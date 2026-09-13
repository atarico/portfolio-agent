import { timingSafeEqual } from "node:crypto";

type Env = Record<string, string | undefined>;

export type McpAuthResult = { ok: true } | { ok: false; response: Response };

/**
 * Optional bearer authentication for the public MCP endpoint.
 *
 * When MCP_AUTH_TOKEN is unset the endpoint is open, which is fine for a demo
 * that holds no GitHub token or a token without scopes. Set it whenever the
 * deployment holds credentials worth protecting.
 */
export function authorizeMcpRequest(headers: Headers, env: Env = process.env): McpAuthResult {
  const expected = env.MCP_AUTH_TOKEN?.trim();
  if (!expected) return { ok: true };

  const presented = bearerToken(headers.get("authorization"));
  if (presented !== null && constantTimeEquals(presented, expected)) {
    return { ok: true };
  }

  return {
    ok: false,
    response: Response.json(
      { error: "Unauthorized.", code: "unauthorized" },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="portfolio-agent"' } },
    ),
  };
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
