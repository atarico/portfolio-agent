import { describe, expect, it } from "vitest";

import type { PullRequestSummary } from "../../src/ports/github.ts";
import { listContributions } from "../../src/tools/list-contributions.ts";
import { ToolInputError } from "../../src/validation.ts";
import { FakeGitHub } from "../fake-github.ts";

const pr = (overrides: Partial<PullRequestSummary> & { repo: string; number: number }): PullRequestSummary => ({
  title: `PR ${overrides.number}`,
  url: `https://github.com/${overrides.repo}/pull/${overrides.number}`,
  state: "merged",
  approved: false,
  createdAt: "2026-01-01T00:00:00Z",
  ...overrides,
});

// Newest activity first, the order the port promises.
const github = new FakeGitHub({
  pullRequests: {
    octocat: [
      pr({ repo: "acme/cli", number: 40, state: "open" }),
      pr({ repo: "friend/app", number: 7, state: "merged", approved: true }),
      pr({ repo: "acme/cli", number: 12, state: "merged" }),
      pr({ repo: "acme/cli", number: 9, state: "closed" }),
    ],
  },
});

describe("listContributions", () => {
  it("groups the owner's pull requests by repository, most recent activity first", async () => {
    const result = await listContributions(github, { owner: "octocat" });

    expect(result.repositories.map((r) => r.repo)).toEqual(["acme/cli", "friend/app"]);
    expect(result.repositories[0]?.pullRequests.map((p) => p.number)).toEqual([40, 12, 9]);
  });

  it("counts what was merged, so the model can answer without adding it up", async () => {
    const result = await listContributions(github, { owner: "octocat" });

    expect(result.total).toBe(4);
    expect(result.merged).toBe(2);
  });

  it("keeps each pull request's state, approval and link", async () => {
    const result = await listContributions(github, { owner: "octocat" });

    expect(result.repositories[1]?.pullRequests[0]).toEqual({
      number: 7,
      title: "PR 7",
      url: "https://github.com/friend/app/pull/7",
      state: "merged",
      approved: true,
      createdAt: "2026-01-01T00:00:00Z",
    });
  });

  it("says that only public pull requests are visible, so a missing private one is not read as absent", async () => {
    const result = await listContributions(new FakeGitHub(), { owner: "octocat" });

    expect(result.total).toBe(0);
    expect(result.note).toMatch(/public/i);
  });

  it("caps the list with `limit`, keeping the most recent, and reports the total before capping", async () => {
    const result = await listContributions(github, { owner: "octocat", limit: 2 });

    expect(result.repositories.flatMap((r) => r.pullRequests.map((p) => p.number))).toEqual([40, 7]);
    expect(result.total).toBe(4);
  });

  it("rejects a limit below 1", async () => {
    await expect(listContributions(github, { owner: "octocat", limit: 0 })).rejects.toBeInstanceOf(ToolInputError);
  });
});
