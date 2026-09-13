import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { GitHubPort } from "./ports/github.ts";
import { DEFAULT_README_MAX_CHARS, getReadme } from "./tools/get-readme.ts";
import { detectStack } from "./tools/detect-stack.ts";
import { DEFAULT_REPO_LIMIT, listRepos } from "./tools/list-repos.ts";
import { validateOwner, validateRepo } from "./validation.ts";

export const SERVER_NAME = "portfolio-agent";
export const SERVER_VERSION = "0.1.0";

export interface PortfolioServerDeps {
  github: GitHubPort;
  /**
   * GitHub user whose portfolio the tools describe. Fixed at construction:
   * callers cannot redirect the server (and any token it holds) to another
   * account.
   */
  owner: string;
}

const repoField = z.string().describe("Repository name, without the owner prefix.");

/** Registers the portfolio tools on an existing server (useful for embedding). */
export function registerPortfolioTools(server: McpServer, deps: PortfolioServerDeps): void {
  const owner = validateOwner(deps.owner);
  const { github } = deps;

  server.registerTool(
    "list_repos",
    {
      title: "List repositories",
      description: `List the public repositories of ${owner}, newest push first. Forks are excluded unless includeForks is true. Use it first to discover which projects exist.`,
      inputSchema: z.object({
        includeForks: z.boolean().optional().describe("Include forked repositories. Defaults to false."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe(`Maximum repositories to return. Defaults to ${DEFAULT_REPO_LIMIT}.`),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ includeForks, limit }) =>
      run("list_repos", () => listRepos(github, { owner, includeForks, limit })),
  );

  server.registerTool(
    "get_readme",
    {
      title: "Get README",
      description:
        "Fetch the README of one repository as markdown, truncated to keep context small. Use it to understand what a project does and how it is built.",
      inputSchema: z.object({
        repo: repoField,
        maxChars: z
          .number()
          .int()
          .min(200)
          .max(50_000)
          .optional()
          .describe(`Maximum characters to return. Defaults to ${DEFAULT_README_MAX_CHARS}.`),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ repo, maxChars }) =>
      run("get_readme", () => getReadme(github, { owner, repo: validateRepo(repo), maxChars })),
  );

  server.registerTool(
    "detect_stack",
    {
      title: "Detect stack",
      description:
        "Inspect a repository's manifest (package.json, pyproject.toml or go.mod) and summarize its runtime, frameworks, notable libraries and package manager.",
      inputSchema: z.object({
        repo: repoField,
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ repo }) => run("detect_stack", () => detectStack(github, { owner, repo: validateRepo(repo) })),
  );
}

/** Creates a standalone MCP server with the portfolio tools registered. */
export function createPortfolioMcpServer(deps: PortfolioServerDeps): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerPortfolioTools(server, deps);
  return server;
}

/**
 * Runs a tool body and maps success/failure to an MCP result the model can read.
 *
 * A failure is logged server-side with the failing tool's name: this is the only
 * layer that sees the real error (a GitHub 403, the unauthenticated rate limit, a
 * 5xx, a network error, ...) before it is flattened into a generic MCP error result,
 * so without this log the operator has no signal that anything went wrong.
 */
async function run(name: string, body: () => Promise<Record<string, unknown>>): Promise<CallToolResult> {
  try {
    const payload = await body();
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  } catch (error) {
    console.error(`[mcp-server] tool "${name}" failed:`, error);
    const message = error instanceof Error ? error.message : String(error);
    return { isError: true, content: [{ type: "text", text: message }] };
  }
}
