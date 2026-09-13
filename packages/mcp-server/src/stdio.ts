#!/usr/bin/env node
/**
 * Runs the portfolio MCP server over stdio, so it can be attached to any
 * MCP host that spawns local servers (Claude Code, Claude Desktop, Cursor...).
 *
 * Environment:
 *   GITHUB_OWNER  portfolio owner (see resolveOwner for the default)
 *   GITHUB_TOKEN  optional token to raise the GitHub rate limit
 */
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

import { GitHubRestAdapter } from "./adapters/github-rest.ts";
import { resolveOwner } from "./owner.ts";
import { createPortfolioMcpServer } from "./server.ts";

const server = createPortfolioMcpServer({
  github: new GitHubRestAdapter({ token: process.env.GITHUB_TOKEN }),
  owner: resolveOwner(process.env),
});

await server.connect(new StdioServerTransport());
