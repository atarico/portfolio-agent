import { createMcpHandler } from "@modelcontextprotocol/server";
import { GitHubRestAdapter, createPortfolioMcpServer, resolveOwner } from "@portfolio-agent/mcp-server";

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
 * token) at another account. Set MCP_AUTH_TOKEN to require a bearer token.
 */
const handler = createMcpHandler(() =>
  createPortfolioMcpServer({
    github: new GitHubRestAdapter({ token: process.env.GITHUB_TOKEN }),
    owner: resolveOwner(process.env),
  }),
);

function guarded(request: Request): Promise<Response> | Response {
  const auth = authorizeMcpRequest(request.headers);
  return auth.ok ? handler.fetch(request) : auth.response;
}

export function GET(request: Request) {
  return guarded(request);
}

export function POST(request: Request) {
  return guarded(request);
}

export function DELETE(request: Request) {
  return guarded(request);
}
