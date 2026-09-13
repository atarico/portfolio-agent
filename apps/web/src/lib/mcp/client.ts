import { createMCPClient } from "@ai-sdk/mcp";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { GitHubRestAdapter, type GitHubPort, createPortfolioMcpServer } from "@portfolio-agent/mcp-server";

import type { Env } from "@/lib/http/env";

export interface PortfolioMcpConnection {
  /** MCP tools converted to AI SDK tools, keyed by tool name. */
  tools: () => ReturnType<Awaited<ReturnType<typeof createMCPClient>>["tools"]>;
  /** Releases the client (and the in-process server, when one was started). Idempotent. */
  close: () => Promise<void>;
}

export interface ConnectOptions {
  env?: Env;
  /** Portfolio owner the in-process server is pinned to. */
  owner: string;
  /** GitHub port for the in-process server. Defaults to the REST adapter. */
  github?: GitHubPort;
}

export interface RemoteTransportConfig {
  type: "http";
  url: string;
  headers?: Record<string, string>;
}

/**
 * Returns the explicitly configured remote MCP server URL, or `null` for the
 * default in-process mode. The value comes from the environment only: the
 * incoming request never influences where the agent connects.
 */
export function resolveMcpServerUrl(env: Env = process.env): string | null {
  const raw = env.MCP_SERVER_URL?.trim();
  if (!raw) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`MCP_SERVER_URL must be an absolute http(s) URL, got "${raw}".`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`MCP_SERVER_URL must use http or https, got "${parsed.protocol}".`);
  }
  return parsed.toString();
}

/** Streamable HTTP transport for an explicitly configured remote MCP server. */
export function remoteTransportConfig(url: string, env: Env = process.env): RemoteTransportConfig {
  const authorization = env.MCP_SERVER_AUTHORIZATION?.trim();
  return authorization ? { type: "http", url, headers: { Authorization: authorization } } : { type: "http", url };
}

/**
 * Connects the agent to the portfolio MCP server.
 *
 * Default: in-process. A real MCP client and the real server talk over an
 * in-memory transport, so there is no network hop, no self-request on
 * serverless, and nothing derived from the inbound request.
 *
 * Opt-in: set MCP_SERVER_URL to point the agent at any remote MCP server.
 */
export async function connectPortfolioMcp({
  env = process.env,
  owner,
  github,
}: ConnectOptions): Promise<PortfolioMcpConnection> {
  const remoteUrl = resolveMcpServerUrl(env);

  if (remoteUrl !== null) {
    const client = await createMCPClient({ transport: remoteTransportConfig(remoteUrl, env) });
    return { tools: () => client.tools(), close: once(() => client.close()) };
  }

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createPortfolioMcpServer({
    github: github ?? new GitHubRestAdapter({ token: env.GITHUB_TOKEN }),
    owner,
  });
  await server.connect(serverTransport);

  const client = await createMCPClient({ transport: clientTransport });

  return {
    tools: () => client.tools(),
    close: once(async () => {
      await client.close();
      await server.close();
    }),
  };
}

function once(fn: () => Promise<void>): () => Promise<void> {
  let pending: Promise<void> | undefined;
  return () => (pending ??= fn());
}
