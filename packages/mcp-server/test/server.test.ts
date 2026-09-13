import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPortfolioMcpServer } from "../src/server.ts";
import { FakeGitHub, repo } from "./fake-github.ts";

const github = new FakeGitHub({
  repos: [repo({ name: "portfolio", language: "Astro" }), repo({ name: "fork", isFork: true })],
  readmes: { "octocat/portfolio": "# Portfolio" },
  files: { "octocat/portfolio/package.json": JSON.stringify({ dependencies: { astro: "^6" } }) },
});

const client = new Client({ name: "test-client", version: "0.0.0" });

beforeAll(async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createPortfolioMcpServer({ github, owner: "octocat" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client.close();
});

describe("portfolio MCP server", () => {
  it("exposes exactly the three portfolio tools", async () => {
    const { tools } = await client.listTools();

    expect(tools.map((t) => t.name).sort()).toEqual(["detect_stack", "get_readme", "list_repos"]);
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
