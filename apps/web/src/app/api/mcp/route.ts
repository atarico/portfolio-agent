import { createMcpHandler } from "@modelcontextprotocol/server";
import { GitHubRestAdapter, createPortfolioMcpServer, resolveOwner } from "@portfolio-agent/mcp-server";

import { createRateLimiter, type RateLimiter } from "@/lib/chat/rate-limit";
import type { Env } from "@/lib/http/env";
import { applyPublicGuards } from "@/lib/http/guards";
import { authorizeMcpRequest } from "@/lib/mcp/auth";

/**
 * Streamable HTTP endpoint for the portfolio MCP server, for external hosts:
 *   claude mcp add --transport http portfolio-agent http://localhost:3000/api/mcp
 *
 * The chat agent does not go through this route: it talks to the same server
 * in-process (see src/lib/mcp/client.ts).
 *
 * A fresh server instance is created per request (stateless), which is what
 * serverless runtimes such as Vercel expect. The owner is fixed by
 * configuration, so a caller can never point the server (and its GitHub
 * token) at another account. Set MCP_AUTH_TOKEN to require a bearer token;
 * it fails closed in production when that token is unset (see lib/mcp/auth.ts).
 */
export function portfolioServerFor(env: Env, fetchImpl?: typeof fetch): ReturnType<typeof createPortfolioMcpServer> {
  return createPortfolioMcpServer({
    github: new GitHubRestAdapter({ token: env.GITHUB_TOKEN, fetch: fetchImpl }),
    owner: resolveOwner(env),
  });
}

export interface McpRouteDeps {
  env?: Env;
  limiter?: RateLimiter;
  createServer?: (env: Env) => ReturnType<typeof portfolioServerFor>;
}

/**
 * Dependency-injected route handler. Tests build their own instance with an
 * injected limiter, env, and server factory; production binds one default
 * instance below. This is what makes the guard composition (rate limit,
 * then auth, then dispatch) assertable without mutating `process.env` or
 * sharing rate-limiter state across test cases.
 */
export function createMcpRouteHandler(deps: McpRouteDeps = {}): (request: Request) => Promise<Response> {
  const env = deps.env ?? process.env;
  const limiter = deps.limiter ?? createRateLimiter({ limit: 20, windowMs: 10 * 60 * 1000 });
  const createServer = deps.createServer ?? portfolioServerFor;
  const handler = createMcpHandler(() => createServer(env));

  return async (request: Request): Promise<Response> => {
    const denied = applyPublicGuards(request, { limiter, env, authorize: authorizeMcpRequest });
    return denied ?? handler.fetch(request);
  };
}

const defaultHandler = createMcpRouteHandler();

export function GET(request: Request) {
  return defaultHandler(request);
}

export function POST(request: Request) {
  return defaultHandler(request);
}

export function DELETE(request: Request) {
  return defaultHandler(request);
}
