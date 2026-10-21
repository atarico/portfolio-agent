import type { GitHubPort, PullRequestSummary, RepoSummary } from "../src/ports/github.ts";

export interface FakeGitHubData {
  repos?: RepoSummary[];
  /** Keyed by `owner/repo`. */
  readmes?: Record<string, string>;
  /** Keyed by `owner/repo/path`. */
  files?: Record<string, string>;
  /** Pull requests opened outside the author's own repositories, keyed by author. */
  pullRequests?: Record<string, PullRequestSummary[]>;
}

/** In-memory GitHub port for behavior tests. */
export class FakeGitHub implements GitHubPort {
  readonly calls: string[] = [];

  constructor(private readonly data: FakeGitHubData = {}) {}

  async listRepos(owner: string): Promise<RepoSummary[]> {
    this.calls.push(`listRepos:${owner}`);
    return (this.data.repos ?? []).filter((repo) =>
      repo.fullName.startsWith(`${owner}/`),
    );
  }

  async getReadme(owner: string, repo: string): Promise<string | null> {
    this.calls.push(`getReadme:${owner}/${repo}`);
    return this.data.readmes?.[`${owner}/${repo}`] ?? null;
  }

  async listExternalPullRequests(author: string): Promise<PullRequestSummary[]> {
    this.calls.push(`listExternalPullRequests:${author}`);
    return this.data.pullRequests?.[author] ?? [];
  }

  async getFile(owner: string, repo: string, path: string): Promise<string | null> {
    this.calls.push(`getFile:${owner}/${repo}/${path}`);
    return this.data.files?.[`${owner}/${repo}/${path}`] ?? null;
  }

  async listFiles(owner: string, repo: string): Promise<string[]> {
    this.calls.push(`listFiles:${owner}/${repo}`);
    const prefix = `${owner}/${repo}/`;
    return Object.keys(this.data.files ?? {})
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length));
  }
}

export function repo(overrides: Partial<RepoSummary> & { name: string }): RepoSummary {
  const owner = overrides.fullName?.split("/")[0] ?? "octocat";
  return {
    fullName: `${owner}/${overrides.name}`,
    description: null,
    language: null,
    stars: 0,
    updatedAt: "2026-01-01T00:00:00Z",
    url: `https://github.com/${owner}/${overrides.name}`,
    topics: [],
    isFork: false,
    isArchived: false,
    ...overrides,
  };
}
