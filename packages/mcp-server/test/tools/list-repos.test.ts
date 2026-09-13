import { describe, expect, it } from "vitest";

import { listRepos } from "../../src/tools/list-repos.ts";
import { ToolInputError } from "../../src/validation.ts";
import { FakeGitHub, repo } from "../fake-github.ts";

const github = new FakeGitHub({
  repos: [
    repo({ name: "older", updatedAt: "2025-01-01T00:00:00Z", stars: 5 }),
    repo({ name: "newest", updatedAt: "2026-06-01T00:00:00Z", language: "TypeScript" }),
    repo({ name: "a-fork", updatedAt: "2026-07-01T00:00:00Z", isFork: true }),
    repo({ name: "middle", updatedAt: "2026-03-01T00:00:00Z", topics: ["astro", "pwa"] }),
    repo({ name: "someone-elses", fullName: "other/someone-elses" }),
  ],
});

describe("listRepos", () => {
  it("returns the owner's repos sorted by last push, newest first", async () => {
    const result = await listRepos(github, { owner: "octocat" });

    expect(result.owner).toBe("octocat");
    expect(result.repos.map((r) => r.name)).toEqual(["newest", "middle", "older"]);
  });

  it("excludes forks by default and includes them on request", async () => {
    const withoutForks = await listRepos(github, { owner: "octocat" });
    const withForks = await listRepos(github, { owner: "octocat", includeForks: true });

    expect(withoutForks.repos.some((r) => r.name === "a-fork")).toBe(false);
    expect(withForks.repos.map((r) => r.name)).toEqual(["a-fork", "newest", "middle", "older"]);
  });

  it("caps the list with `limit` and reports the total before capping", async () => {
    const result = await listRepos(github, { owner: "octocat", limit: 2 });

    expect(result.repos).toHaveLength(2);
    expect(result.total).toBe(3);
  });

  it("exposes only the fields the model needs", async () => {
    const result = await listRepos(github, { owner: "octocat", limit: 1 });

    expect(result.repos[0]).toEqual({
      name: "newest",
      description: null,
      language: "TypeScript",
      stars: 0,
      updatedAt: "2026-06-01T00:00:00Z",
      url: "https://github.com/octocat/newest",
      topics: [],
      isArchived: false,
    });
  });

  it("returns an empty list for an owner with no repos", async () => {
    const result = await listRepos(github, { owner: "ghost" });

    expect(result).toEqual({ owner: "ghost", total: 0, repos: [] });
  });

  it("rejects a non-positive limit instead of silently returning nearly everything", async () => {
    await expect(listRepos(github, { owner: "octocat", limit: 0 })).rejects.toThrow(ToolInputError);
    await expect(listRepos(github, { owner: "octocat", limit: -1 })).rejects.toThrow(ToolInputError);
  });
});
