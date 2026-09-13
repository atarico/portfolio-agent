import { clientKeyFromHeaders, type RateLimiter } from "@/lib/chat/rate-limit";
import type { McpAuthResult } from "@/lib/mcp/auth";

import { describeError } from "./errors";
import type { Env } from "./env";

export type Authorizer = (headers: Headers, env: Env) => McpAuthResult;

export interface PublicGuardOptions {
  limiter: RateLimiter;
  env?: Env;
  authorize?: Authorizer;
}

/**
 * Shared guard floor for every public HTTP entrypoint: rate limit, then auth
 * (when the route needs it). Runs in exactly this order so it is defined in
 * one testable place instead of drifting per route. Returns the denial
 * response, or `null` to let the route continue.
 */
export function applyPublicGuards(request: Request, { limiter, env = process.env, authorize }: PublicGuardOptions): Response | null {
  const quota = limiter.check(clientKeyFromHeaders(request.headers));
  if (!quota.allowed) {
    return Response.json(describeError(undefined, { code: "rate_limited", env }), {
      status: 429,
      headers: { "Retry-After": String(quota.retryAfterSeconds) },
    });
  }

  if (authorize) {
    const auth = authorize(request.headers, env);
    if (!auth.ok) return auth.response;
  }

  return null;
}
