import { describe, expect, it } from "vitest";

import { CachingGitHubPort } from "../../src/adapters/caching-github.ts";
import type { GitHubPort } from "../../src/ports/github.ts";
import { FakeGitHub } from "../fake-github.ts";

const github = () => new FakeGitHub({ readmes: { "octocat/a": "# A" }, files: { "octocat/a/x.txt": "x" } });

describe("CachingGitHubPort", () => {
  it("serves a repeated identical call from cache", async () => {
    const inner = github();
    const cached = new CachingGitHubPort(inner);

    expect(await cached.getReadme("octocat", "a")).toBe("# A");
    expect(await cached.getReadme("octocat", "a")).toBe("# A");
    await cached.getFile("octocat", "a", "x.txt");
    await cached.getFile("octocat", "a", "y.txt");
    await cached.listFiles("octocat", "a");
    await cached.listFiles("octocat", "a");

    expect(inner.calls.filter((c) => c.startsWith("getReadme"))).toHaveLength(1);
    expect(inner.calls.filter((c) => c.startsWith("getFile"))).toHaveLength(2);
    expect(inner.calls.filter((c) => c.startsWith("listFiles"))).toHaveLength(1);
  });

  it("caches null results", async () => {
    const inner = github();
    const cached = new CachingGitHubPort(inner);

    expect(await cached.getReadme("octocat", "ghost")).toBeNull();
    expect(await cached.getReadme("octocat", "ghost")).toBeNull();

    expect(inner.calls).toEqual(["getReadme:octocat/ghost"]);
  });

  it("does not cache rejections", async () => {
    let attempts = 0;
    const base = github();
    const flaky: GitHubPort = {
      listRepos: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("boom");
        return [];
      },
      getReadme: (owner, repo) => base.getReadme(owner, repo),
      getFile: (owner, repo, path) => base.getFile(owner, repo, path),
      listFiles: (owner, repo) => base.listFiles(owner, repo),
    };
    const cached = new CachingGitHubPort(flaky);

    await expect(cached.listRepos("octocat")).rejects.toThrow("boom");
    expect(await cached.listRepos("octocat")).toEqual([]);
    expect(attempts).toBe(2);
  });

  it("shares one in-flight promise between concurrent identical calls", async () => {
    const inner = github();
    const cached = new CachingGitHubPort(inner);

    const results = await Promise.all([cached.getReadme("octocat", "a"), cached.getReadme("octocat", "a")]);

    expect(results).toEqual(["# A", "# A"]);
    expect(inner.calls).toEqual(["getReadme:octocat/a"]);
  });

  it("expires entries after ttlMs", async () => {
    const inner = github();
    let time = 1_000;
    const cached = new CachingGitHubPort(inner, { ttlMs: 100, now: () => time });

    await cached.getReadme("octocat", "a");
    time += 99;
    await cached.getReadme("octocat", "a");
    expect(inner.calls).toHaveLength(1);
    time += 1;
    await cached.getReadme("octocat", "a");
    expect(inner.calls).toHaveLength(2);
  });

  it("evicts the oldest entry beyond maxEntries", async () => {
    const inner = github();
    const cached = new CachingGitHubPort(inner, { maxEntries: 2 });

    await cached.getFile("octocat", "a", "1");
    await cached.getFile("octocat", "a", "2");
    await cached.getFile("octocat", "a", "3");
    await cached.getFile("octocat", "a", "2");
    await cached.getFile("octocat", "a", "1");

    expect(inner.calls).toEqual([
      "getFile:octocat/a/1",
      "getFile:octocat/a/2",
      "getFile:octocat/a/3",
      "getFile:octocat/a/1",
    ]);
  });
});
