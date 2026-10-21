import { CachingGitHubPort, GitHubRestAdapter, type GitHubPort } from "@portfolio-agent/mcp-server";

import type { Env } from "@/lib/http/env";

let shared: { token: string | undefined; port: GitHubPort } | undefined;

/**
 * The GitHub port the in-process MCP server uses by default: the REST adapter
 * behind one cache shared by every request in this process. A cache per
 * request would forget everything the moment an answer finished; sharing it is
 * what lets a repeated question skip GitHub (60 requests/hour unauthenticated).
 * It is rebuilt when GITHUB_TOKEN changes, so data read with one token is never
 * served under another.
 */
export function sharedGitHubPort(env: Env = process.env): GitHubPort {
  const token = env.GITHUB_TOKEN?.trim() || undefined;
  if (!shared || shared.token !== token) {
    shared = { token, port: new CachingGitHubPort(new GitHubRestAdapter({ token })) };
  }
  return shared.port;
}
