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
