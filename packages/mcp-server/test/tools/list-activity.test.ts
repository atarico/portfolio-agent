import { describe, expect, it } from "vitest";

import type { CommitSummary, PullRequestSummary } from "../../src/ports/github.ts";
import { DEFAULT_ACTIVITY_LIMIT, listActivity } from "../../src/tools/list-activity.ts";
import { ToolInputError } from "../../src/validation.ts";
import { FakeGitHub } from "../fake-github.ts";

const commit = (n: number, repo = "octocat/portfolio"): CommitSummary => ({
  repo,
  sha: `abc${n}`,
  message: `feat: change ${n}`,
  date: `2026-10-${String(28 - n).padStart(2, "0")}T00:00:00Z`,
  url: `https://github.com/${repo}/commit/abc${n}`,
});

const pullRequest = (number: number, state: PullRequestSummary["state"], repo = "octocat/portfolio"): PullRequestSummary => ({
  repo,
  number,
  title: `PR ${number}`,
  url: `https://github.com/${repo}/pull/${number}`,
  state,
  approved: false,
  createdAt: "2026-10-01T00:00:00Z",
});

describe("listActivity", () => {
  it("returns the latest commits and the pull requests opened in their own repositories, newest first", async () => {
    const github = new FakeGitHub({
      ownCommits: { octocat: { total: 968, items: [commit(1), commit(2, "octocat/cli")] } },
      ownPullRequests: {
        octocat: { total: 201, items: [pullRequest(3, "open"), pullRequest(2, "merged"), pullRequest(1, "closed")] },
      },
    });

    const result = await listActivity(github, { owner: "octocat" });

    expect(result.owner).toBe("octocat");
    expect(result.commits).toEqual({ total: 968, recent: [commit(1), commit(2, "octocat/cli")] });
    expect(result.pullRequests).toMatchObject({ total: 201, counted: 3, merged: 1, open: 1, closed: 1 });
    expect(result.pullRequests.recent.map(({ number }) => number)).toEqual([3, 2, 1]);
  });

  it("counts states over every pull request fetched, but returns only `limit` commits and pull requests", async () => {
    const github = new FakeGitHub({
      ownCommits: { octocat: { total: 5, items: [1, 2, 3, 4, 5].map((n) => commit(n)) } },
      ownPullRequests: {
        octocat: {
          total: 5,
          items: [pullRequest(5, "merged"), pullRequest(4, "merged"), pullRequest(3, "merged"), pullRequest(2, "merged"), pullRequest(1, "open")],
        },
      },
    });

    const result = await listActivity(github, { owner: "octocat", limit: 2 });

    expect(result.commits.recent).toHaveLength(2);
    expect(result.pullRequests.recent).toHaveLength(2);
    expect(result.pullRequests).toMatchObject({ counted: 5, merged: 4, open: 1, closed: 0 });
  });

  it(`returns ${DEFAULT_ACTIVITY_LIMIT} of each by default`, async () => {
    const many = Array.from({ length: DEFAULT_ACTIVITY_LIMIT + 5 }, (_, i) => i + 1);
    const github = new FakeGitHub({
      ownCommits: { octocat: { total: many.length, items: many.map((n) => commit(n % 20)) } },
      ownPullRequests: { octocat: { total: many.length, items: many.map((n) => pullRequest(n, "merged")) } },
    });

    const result = await listActivity(github, { owner: "octocat" });

    expect(result.commits.recent).toHaveLength(DEFAULT_ACTIVITY_LIMIT);
    expect(result.pullRequests.recent).toHaveLength(DEFAULT_ACTIVITY_LIMIT);
  });

  it("says it covers public repositories only, so work it cannot see is not read as no work", async () => {
    const result = await listActivity(new FakeGitHub(), { owner: "octocat" });

    expect(result.commits).toEqual({ total: 0, recent: [] });
    expect(result.pullRequests).toEqual({ total: 0, counted: 0, merged: 0, open: 0, closed: 0, recent: [] });
    expect(result.note).toMatch(/public/i);
    expect(result.note).toMatch(/private/i);
  });

  it("rejects a limit below 1", async () => {
    await expect(listActivity(new FakeGitHub(), { owner: "octocat", limit: 0 })).rejects.toBeInstanceOf(ToolInputError);
  });
});
