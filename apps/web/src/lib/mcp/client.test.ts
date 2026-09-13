import type { GitHubPort } from "@portfolio-agent/mcp-server";
import { describe, expect, it } from "vitest";

import { connectPortfolioMcp, remoteTransportConfig, resolveMcpServerUrl } from "./client";

describe("resolveMcpServerUrl", () => {
  it("returns null when MCP_SERVER_URL is unset or blank (in-process default)", () => {
    expect(resolveMcpServerUrl({})).toBeNull();
    expect(resolveMcpServerUrl({ MCP_SERVER_URL: "   " })).toBeNull();
  });

  it("returns a trimmed absolute http(s) URL when configured", () => {
    expect(resolveMcpServerUrl({ MCP_SERVER_URL: " https://mcp.example.com/mcp " })).toBe(
      "https://mcp.example.com/mcp",
    );
    expect(resolveMcpServerUrl({ MCP_SERVER_URL: "http://localhost:8080/mcp" })).toBe(
      "http://localhost:8080/mcp",
    );
  });

  it("rejects relative, non-http and malformed values", () => {
    for (const bad of ["/api/mcp", "ftp://mcp.example.com", "not a url", "javascript:alert(1)"]) {
      expect(() => resolveMcpServerUrl({ MCP_SERVER_URL: bad }), bad).toThrow(/MCP_SERVER_URL/);
    }
  });
});

const fakeGitHub: GitHubPort = {
  async listRepos() {
    return [];
  },
  async getReadme() {
    return "# hello";
  },
  async getFile() {
    return null;
  },
};

describe("connectPortfolioMcp (in-process)", () => {
  it("connects a real MCP client to the portfolio server without any network hop", async () => {
    const connection = await connectPortfolioMcp({ env: {}, owner: "octocat", github: fakeGitHub });

    try {
      const tools = await connection.tools();
      expect(Object.keys(tools).sort()).toEqual(["detect_stack", "get_readme", "list_repos"]);
    } finally {
      await connection.close();
    }
  });

  it("closes idempotently", async () => {
    const connection = await connectPortfolioMcp({ env: {}, owner: "octocat", github: fakeGitHub });

    await connection.close();
    await expect(connection.close()).resolves.toBeUndefined();
  });
});

describe("remoteTransportConfig", () => {
  it("builds an http transport config and only adds Authorization when configured", () => {
    expect(remoteTransportConfig("https://mcp.example.com/mcp", {})).toEqual({
      type: "http",
      url: "https://mcp.example.com/mcp",
    });
    expect(
      remoteTransportConfig("https://mcp.example.com/mcp", { MCP_SERVER_AUTHORIZATION: "Bearer abc" }),
    ).toEqual({
      type: "http",
      url: "https://mcp.example.com/mcp",
      headers: { Authorization: "Bearer abc" },
    });
  });
});
