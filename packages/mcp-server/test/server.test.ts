import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { GitHubPort } from "../src/ports/github.ts";
import { createPortfolioMcpServer } from "../src/server.ts";
import { FakeGitHub, repo } from "./fake-github.ts";
import { octocatProfile } from "./fake-profile.ts";

const github = new FakeGitHub({
  repos: [repo({ name: "portfolio", language: "Astro" }), repo({ name: "fork", isFork: true })],
  readmes: { "octocat/portfolio": "# Portfolio" },
  files: { "octocat/portfolio/package.json": JSON.stringify({ dependencies: { astro: "^6" } }) },
});

const client = new Client({ name: "test-client", version: "0.0.0" });

beforeAll(async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createPortfolioMcpServer({ github, owner: "octocat", profile: octocatProfile });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client.close();
});

describe("portfolio MCP server", () => {
  it("exposes exactly the five portfolio tools", async () => {
    const { tools } = await client.listTools();

    expect(tools.map((t) => t.name).sort()).toEqual([
      "detect_stack",
      "get_profile",
      "get_readme",
      "list_contributions",
      "list_repos",
    ]);
    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
    }
  });

  it("never accepts an owner from the caller: the owner is server configuration", async () => {
    const { tools } = await client.listTools();

    for (const tool of tools) {
      const properties = (tool.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
      expect(Object.keys(properties), tool.name).not.toContain("owner");
    }
  });

  it("ignores a caller-supplied owner and stays pinned to the configured one", async () => {
    const result = await client.callTool({
      name: "get_readme",
      arguments: { owner: "mallory", repo: "portfolio" },
    });

    if (!result.isError) {
      expect(result.structuredContent).toMatchObject({ owner: "octocat" });
    }
    expect(github.calls.some((call) => call.includes("mallory"))).toBe(false);
  });

  it("list_repos uses the configured owner and returns structured content", async () => {
    const result = await client.callTool({ name: "list_repos", arguments: {} });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      owner: "octocat",
      total: 1,
      repos: [{ name: "portfolio", language: "Astro" }],
    });
    const [first] = result.content as Array<{ type: string; text: string }>;
    expect(first?.type).toBe("text");
    expect(JSON.parse(first?.text ?? "")).toMatchObject({ owner: "octocat" });
  });

  it("serializes the text content as compact JSON that matches structuredContent", async () => {
    const result = await client.callTool({ name: "list_repos", arguments: {} });

    const [first] = result.content as Array<{ type: string; text: string }>;
    const text = first?.text ?? "";
    expect(text).not.toMatch(/\n/);
    expect(text).toBe(JSON.stringify(JSON.parse(text)));
    expect(JSON.parse(text)).toEqual(result.structuredContent);
  });

  it("get_readme returns the README for a repo", async () => {
    const result = await client.callTool({ name: "get_readme", arguments: { repo: "portfolio" } });

    expect(result.structuredContent).toMatchObject({ found: true, content: "# Portfolio" });
  });

  it("get_readme reports a missing README without erroring", async () => {
    const result = await client.callTool({ name: "get_readme", arguments: { repo: "ghost" } });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ found: false });
  });

  it("detect_stack summarizes the repo stack", async () => {
    const result = await client.callTool({ name: "detect_stack", arguments: { repo: "portfolio" } });

    expect(result.structuredContent).toMatchObject({ runtime: "node", frameworks: ["Astro"] });
  });

  it("get_profile returns the requested sections of the configured owner's profile", async () => {
    const result = await client.callTool({ name: "get_profile", arguments: { sections: ["projects"] } });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      owner: "octocat",
      found: true,
      name: "The Octocat",
      sources: octocatProfile.sources,
      projects: octocatProfile.projects,
    });
  });

  it("get_profile rejects a section it does not have", async () => {
    const result = await client.callTool({ name: "get_profile", arguments: { sections: ["salary"] } });

    expect(result.isError).toBe(true);
  });

  it("get_profile reads every section a broad question needs in one call", async () => {
    const result = await client.callTool({
      name: "get_profile",
      arguments: { sections: ["overview", "experience", "projects", "skills", "education"] },
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      found: true,
      headline: octocatProfile.headline,
      experience: octocatProfile.experience,
      projects: octocatProfile.projects,
      skills: octocatProfile.skills,
      education: octocatProfile.education,
    });
  });

  it("list_contributions adds the CV's role at an organization with no public pull requests", async () => {
    const result = await client.callTool({ name: "list_contributions", arguments: { project: "github" } });

    expect(result.structuredContent).toMatchObject({ total: 0 });
    expect((result.structuredContent as { note: string }).note).toContain("Mascot at GitHub");
  });

  it("get_profile requires at least one section", async () => {
    for (const sections of [undefined, []]) {
      const result = await client.callTool({ name: "get_profile", arguments: { sections } });

      expect(result.isError, JSON.stringify(sections)).toBe(true);
    }
  });

  it("rejects invalid repo names before hitting GitHub", async () => {
    for (const bad of ["../etc", "..", "."]) {
      const result = await client.callTool({ name: "get_readme", arguments: { repo: bad } });

      expect(result.isError, bad).toBe(true);
    }
    expect(github.calls.filter((call) => call.startsWith("getReadme:octocat/."))).toEqual([]);
  });
});

describe("createPortfolioMcpServer", () => {
  it("refuses to start with an invalid configured owner", () => {
    expect(() => createPortfolioMcpServer({ github, owner: "-bad" })).toThrow(/owner/i);
  });
});

describe("tool failure logging", () => {
  it("logs the failing tool name and error server-side, without changing the model-facing result", async () => {
    const upstreamError = new Error("GitHub API 403 for https://api.github.com/users/octocat/repos: API rate limit exceeded");
    const failingGithub: GitHubPort = {
      listRepos: async () => {
        throw upstreamError;
      },
      getReadme: async () => {
        throw upstreamError;
      },
      getFile: async () => {
        throw upstreamError;
      },
      listFiles: async () => {
        throw upstreamError;
      },
      listExternalPullRequests: async () => {
        throw upstreamError;
      },
      getPrivateContributionCount: async () => {
        throw upstreamError;
      },
    };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createPortfolioMcpServer({ github: failingGithub, owner: "octocat" });
    await server.connect(serverTransport);
    const failingClient = new Client({ name: "test-client", version: "0.0.0" });
    await failingClient.connect(clientTransport);

    const result = await failingClient.callTool({ name: "list_repos", arguments: {} });

    expect(result).toEqual({ isError: true, content: [{ type: "text", text: upstreamError.message }] });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("list_repos"), upstreamError);

    await failingClient.close();
    errorSpy.mockRestore();
  });
});
