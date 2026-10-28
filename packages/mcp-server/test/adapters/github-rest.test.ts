import { describe, expect, it } from "vitest";

import { GitHubRestAdapter } from "../../src/adapters/github-rest.ts";

interface RecordedRequest {
  url: string;
  headers: Record<string, string>;
  signal: AbortSignal | null | undefined;
}

function fakeFetch(routes: Record<string, () => Response>) {
  const requests: RecordedRequest[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    requests.push({ url, headers, signal: init?.signal });
    const route = routes[url];
    return route ? route() : new Response("not found", { status: 404 });
  };
  return { fetchImpl, requests };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("GitHubRestAdapter", () => {
  it("lists repos for an owner and maps the REST payload to RepoSummary", async () => {
    const { fetchImpl, requests } = fakeFetch({
      "https://api.github.com/users/octocat/repos?type=owner&sort=pushed&per_page=100": () =>
        json([
          {
            name: "hello",
            full_name: "octocat/hello",
            description: "Hi",
            language: "TypeScript",
            stargazers_count: 3,
            pushed_at: "2026-02-02T00:00:00Z",
            updated_at: "2026-02-03T00:00:00Z",
            html_url: "https://github.com/octocat/hello",
            topics: ["demo"],
            fork: false,
            archived: false,
          },
        ]),
    });
    const adapter = new GitHubRestAdapter({ fetch: fetchImpl });

    const repos = await adapter.listRepos("octocat");

    expect(repos).toEqual([
      {
        name: "hello",
        fullName: "octocat/hello",
        description: "Hi",
        language: "TypeScript",
        stars: 3,
        updatedAt: "2026-02-02T00:00:00Z",
        url: "https://github.com/octocat/hello",
        topics: ["demo"],
        isFork: false,
        isArchived: false,
      },
    ]);
    expect(requests[0]?.headers["accept"]).toBe("application/vnd.github+json");
    expect(requests[0]?.headers["authorization"]).toBeUndefined();
  });

  it("bounds every outbound request with a timeout signal", async () => {
    const { fetchImpl, requests } = fakeFetch({
      "https://api.github.com/users/octocat/repos?type=owner&sort=pushed&per_page=100": () => json([]),
    });
    const adapter = new GitHubRestAdapter({ fetch: fetchImpl });

    await adapter.listRepos("octocat");

    expect(requests[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(requests[0]?.signal?.aborted).toBe(false);
  });

  it("sends a bearer token when configured", async () => {
    const { fetchImpl, requests } = fakeFetch({
      "https://api.github.com/users/octocat/repos?type=owner&sort=pushed&per_page=100": () => json([]),
    });
    const adapter = new GitHubRestAdapter({ fetch: fetchImpl, token: "ghp_test" });

    await adapter.listRepos("octocat");

    expect(requests[0]?.headers["authorization"]).toBe("Bearer ghp_test");
  });

  it("returns the raw README and null when the repo has none", async () => {
    const { fetchImpl, requests } = fakeFetch({
      "https://api.github.com/repos/octocat/hello/readme": () => new Response("# Hello"),
    });
    const adapter = new GitHubRestAdapter({ fetch: fetchImpl });

    expect(await adapter.getReadme("octocat", "hello")).toBe("# Hello");
    expect(await adapter.getReadme("octocat", "missing")).toBeNull();
    expect(requests[0]?.headers["accept"]).toBe("application/vnd.github.raw+json");
  });

  it("returns raw file content and null for a missing path", async () => {
    const { fetchImpl } = fakeFetch({
      "https://api.github.com/repos/octocat/hello/contents/package.json": () =>
        new Response('{"name":"hello"}'),
    });
    const adapter = new GitHubRestAdapter({ fetch: fetchImpl });

    expect(await adapter.getFile("octocat", "hello", "package.json")).toBe('{"name":"hello"}');
    expect(await adapter.getFile("octocat", "hello", "nope.txt")).toBeNull();
  });

  it("throws a descriptive error on non-404 failures such as rate limiting", async () => {
    const { fetchImpl } = fakeFetch({
      "https://api.github.com/users/octocat/repos?type=owner&sort=pushed&per_page=100": () =>
        json({ message: "API rate limit exceeded" }, 403),
    });
    const adapter = new GitHubRestAdapter({ fetch: fetchImpl });

    await expect(adapter.listRepos("octocat")).rejects.toThrow(/403.*rate limit/i);
  });
});

describe("GitHubRestAdapter.getFile path handling", () => {
  it("rejects traversal, empty and absolute path segments before any request", async () => {
    const { fetchImpl, requests } = fakeFetch({});
    const adapter = new GitHubRestAdapter({ fetch: fetchImpl });

    for (const bad of ["../secrets", "./x", "a/../b", "a//b", "/etc/passwd", ""]) {
      await expect(adapter.getFile("octocat", "hello", bad), bad).rejects.toThrow(/path/i);
    }
    expect(requests).toEqual([]);
  });

  it("still fetches nested paths", async () => {
    const { fetchImpl, requests } = fakeFetch({
      "https://api.github.com/repos/octocat/hello/contents/src/app/page.tsx": () => new Response("ok"),
    });
    const adapter = new GitHubRestAdapter({ fetch: fetchImpl });

    expect(await adapter.getFile("octocat", "hello", "src/app/page.tsx")).toBe("ok");
    expect(requests).toHaveLength(1);
  });
});

describe("GitHubRestAdapter.listFiles", () => {
  const url = "https://api.github.com/repos/octocat/hello/git/trees/HEAD?recursive=1";

  it("returns blob paths only, using the JSON media type", async () => {
    const { fetchImpl, requests } = fakeFetch({
      [url]: () =>
        json({
          tree: [
            { path: "apps", type: "tree" },
            { path: "apps/web/package.json", type: "blob" },
            { path: "README.md", type: "blob" },
            { path: "vendor/lib", type: "commit" },
          ],
        }),
    });
    const adapter = new GitHubRestAdapter({ fetch: fetchImpl });

    expect(await adapter.listFiles("octocat", "hello")).toEqual(["apps/web/package.json", "README.md"]);
    expect(requests[0]?.headers.accept).toBe("application/vnd.github+json");
  });

  it("returns [] when the repository is not found (404) or empty (409)", async () => {
    for (const status of [404, 409]) {
      const { fetchImpl } = fakeFetch({ [url]: () => json({ message: "x" }, status) });
      const adapter = new GitHubRestAdapter({ fetch: fetchImpl });
      expect(await adapter.listFiles("octocat", "hello"), String(status)).toEqual([]);
    }
  });

  it("throws on other failures", async () => {
    const { fetchImpl } = fakeFetch({ [url]: () => json({ message: "boom" }, 500) });
    const adapter = new GitHubRestAdapter({ fetch: fetchImpl });

    await expect(adapter.listFiles("octocat", "hello")).rejects.toThrow(/500.*boom/);
  });
});

describe("GitHubRestAdapter.listExternalPullRequests", () => {
  it("lists pull requests the author opened outside their own repositories, with merge and approval state", async () => {
    const query = "is:pr author:octocat -user:octocat";
    const base = "https://api.github.com/search/issues";
    const item = (repo: string, number: number, state: string, mergedAt: string | null) => ({
      number,
      title: `PR ${number}`,
      html_url: `https://github.com/${repo}/pull/${number}`,
      state,
      created_at: "2026-03-01T00:00:00Z",
      repository_url: `https://api.github.com/repos/${repo}`,
      pull_request: { merged_at: mergedAt },
    });
    const { fetchImpl, requests } = fakeFetch({
      [`${base}?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=100`]: () =>
        json({
          items: [
            item("acme/cli", 40, "open", null),
            item("friend/app", 7, "closed", "2026-03-02T00:00:00Z"),
            item("acme/cli", 9, "closed", null),
          ],
        }),
      [`${base}?q=${encodeURIComponent(`${query} review:approved`)}&per_page=100`]: () =>
        json({ items: [item("friend/app", 7, "closed", "2026-03-02T00:00:00Z")] }),
    });
    const adapter = new GitHubRestAdapter({ fetch: fetchImpl });

    const prs = await adapter.listExternalPullRequests("octocat");

    expect(prs.map(({ repo, number, state, approved }) => ({ repo, number, state, approved }))).toEqual([
      { repo: "acme/cli", number: 40, state: "open", approved: false },
      { repo: "friend/app", number: 7, state: "merged", approved: true },
      { repo: "acme/cli", number: 9, state: "closed", approved: false },
    ]);
    expect(prs[1]).toMatchObject({ title: "PR 7", url: "https://github.com/friend/app/pull/7", createdAt: "2026-03-01T00:00:00Z" });
    expect(requests).toHaveLength(2);
  });

  it("fails loudly when the search API refuses, instead of reporting no contributions", async () => {
    const { fetchImpl } = fakeFetch({});
    const adapter = new GitHubRestAdapter({ fetch: fetchImpl });

    await expect(adapter.listExternalPullRequests("octocat")).rejects.toThrow(/GitHub API 404/);
  });
});

describe("GitHubRestAdapter.listOwnPullRequests", () => {
  it("lists pull requests the author opened in their own public repositories, with GitHub's total", async () => {
    // is:public keeps private repositories out even with a token that can read them.
    const query = "is:pr is:public author:octocat user:octocat";
    const base = "https://api.github.com/search/issues";
    const item = (number: number, state: string, mergedAt: string | null) => ({
      number,
      title: `PR ${number}`,
      html_url: `https://github.com/octocat/app/pull/${number}`,
      state,
      created_at: "2026-10-01T00:00:00Z",
      repository_url: "https://api.github.com/repos/octocat/app",
      pull_request: { merged_at: mergedAt },
    });
    const { fetchImpl, requests } = fakeFetch({
      [`${base}?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=100`]: () =>
        json({ total_count: 201, items: [item(12, "open", null), item(11, "closed", "2026-10-02T00:00:00Z")] }),
      [`${base}?q=${encodeURIComponent(`${query} review:approved`)}&per_page=100`]: () => json({ total_count: 0, items: [] }),
    });
    const adapter = new GitHubRestAdapter({ fetch: fetchImpl });

    const page = await adapter.listOwnPullRequests("octocat");

    expect(page.total).toBe(201);
    expect(page.items.map(({ repo, number, state }) => ({ repo, number, state }))).toEqual([
      { repo: "octocat/app", number: 12, state: "open" },
      { repo: "octocat/app", number: 11, state: "merged" },
    ]);
    expect(requests).toHaveLength(2);
  });
});

describe("GitHubRestAdapter.listOwnCommits", () => {
  // is:public keeps private repositories out even with a token that can read them.
  const query = "author:octocat user:octocat is:public merge:false";
  const url = `https://api.github.com/search/commits?q=${encodeURIComponent(query)}&sort=author-date&order=desc&per_page=100`;

  it("lists the author's newest commits in their own repositories, merge commits excluded, with GitHub's total", async () => {
    const { fetchImpl } = fakeFetch({
      [url]: () =>
        json({
          total_count: 968,
          items: [
            {
              sha: "bc5d974aa1b2c3d4e5f6",
              html_url: "https://github.com/octocat/app/commit/bc5d974aa1b2c3d4e5f6",
              commit: { message: "fix: close the connection\n\nLonger body.", author: { date: "2026-10-28T00:59:11.000-03:00" } },
              repository: { full_name: "octocat/app" },
            },
          ],
        }),
    });
    const adapter = new GitHubRestAdapter({ fetch: fetchImpl });

    const page = await adapter.listOwnCommits("octocat");

    expect(page).toEqual({
      total: 968,
      items: [
        {
          repo: "octocat/app",
          sha: "bc5d974",
          message: "fix: close the connection",
          date: "2026-10-28T00:59:11.000-03:00",
          url: "https://github.com/octocat/app/commit/bc5d974aa1b2c3d4e5f6",
        },
      ],
    });
  });

  it("fails loudly when the search API refuses, instead of reporting no commits", async () => {
    const { fetchImpl } = fakeFetch({});
    const adapter = new GitHubRestAdapter({ fetch: fetchImpl });

    await expect(adapter.listOwnCommits("octocat")).rejects.toThrow(/GitHub API 404/);
  });
});

describe("GitHubRestAdapter.getPrivateContributionCount", () => {
  function graphqlFetch(body: unknown, status = 200) {
    const requests: Array<{ url: string; method: string | undefined; body: string; authorization: string | null }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      requests.push({
        url: String(input),
        method: init?.method,
        body: String(init?.body),
        authorization: new Headers(init?.headers).get("authorization"),
      });
      return json(body, status);
    };
    return { fetchImpl, requests };
  }

  const collection = (shared: boolean, count: number) => ({
    data: {
      user: {
        contributionsCollection: {
          startedAt: "2025-10-19T03:00:00Z",
          endedAt: "2026-10-22T02:59:59Z",
          hasAnyRestrictedContributions: shared,
          restrictedContributionsCount: count,
        },
      },
    },
  });

  it("reads the private contribution count over GraphQL, passing the login as a variable", async () => {
    const { fetchImpl, requests } = graphqlFetch(collection(true, 741));
    const adapter = new GitHubRestAdapter({ token: "t", fetch: fetchImpl });

    // GitHub counts in the owner's time zone: 03:00Z is midnight in UTC-3, so the
    // period ends on the 21st locally even though endedAt falls on the 22nd in UTC.
    await expect(adapter.getPrivateContributionCount("octocat")).resolves.toEqual({
      count: 741,
      from: "2025-10-19",
      to: "2026-10-21",
    });
    expect(requests[0]).toMatchObject({ url: "https://api.github.com/graphql", method: "POST", authorization: "Bearer t" });
    expect(JSON.parse(requests[0]!.body).variables).toEqual({ login: "octocat" });
  });

  it("reads the period's days in the owner's time zone east of UTC too", async () => {
    // Midnight in UTC+2 is 22:00Z of the previous day.
    const body = collection(true, 5);
    body.data.user.contributionsCollection.startedAt = "2025-10-18T22:00:00Z";
    body.data.user.contributionsCollection.endedAt = "2026-10-21T21:59:59Z";
    const { fetchImpl } = graphqlFetch(body);
    const adapter = new GitHubRestAdapter({ token: "t", fetch: fetchImpl });

    await expect(adapter.getPrivateContributionCount("octocat")).resolves.toMatchObject({
      from: "2025-10-19",
      to: "2026-10-21",
    });
  });

  it("returns null when the owner does not share private contributions", async () => {
    const { fetchImpl } = graphqlFetch(collection(false, 0));
    const adapter = new GitHubRestAdapter({ token: "t", fetch: fetchImpl });

    await expect(adapter.getPrivateContributionCount("octocat")).resolves.toBeNull();
  });

  it("returns null without a request when there is no token, since GraphQL requires one", async () => {
    const { fetchImpl, requests } = graphqlFetch(collection(true, 741));
    const adapter = new GitHubRestAdapter({ fetch: fetchImpl });

    await expect(adapter.getPrivateContributionCount("octocat")).resolves.toBeNull();
    expect(requests).toHaveLength(0);
  });

  it("throws on a GraphQL error instead of reporting zero", async () => {
    const { fetchImpl } = graphqlFetch({ errors: [{ message: "Could not resolve to a User" }] });
    const adapter = new GitHubRestAdapter({ token: "t", fetch: fetchImpl });

    await expect(adapter.getPrivateContributionCount("octocat")).rejects.toThrow(/Could not resolve/);
  });
});
