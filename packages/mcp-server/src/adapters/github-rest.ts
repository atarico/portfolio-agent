import type {
  CommitSummary,
  GitHubPort,
  PrivateContributionCount,
  PullRequestSummary,
  RepoSummary,
  SearchPage,
} from "../ports/github.ts";

export interface GitHubRestAdapterOptions {
  /** Personal access token. Optional: unauthenticated calls are limited to 60 requests/hour. */
  token?: string | undefined;
  /** Injectable fetch, mainly for tests. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  baseUrl?: string;
}

interface GitHubRepoPayload {
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  pushed_at: string | null;
  updated_at: string;
  html_url: string;
  topics?: string[];
  fork: boolean;
  archived: boolean;
}

interface SearchIssuePayload {
  number: number;
  title: string;
  html_url: string;
  state: "open" | "closed";
  created_at: string;
  /** API URL of the repository, `.../repos/<owner>/<name>`. */
  repository_url: string;
  pull_request?: { merged_at: string | null };
}

interface SearchCommitPayload {
  sha: string;
  html_url: string;
  commit: { message: string; author: { date: string } };
  repository: { full_name: string };
}

interface ContributionsCollectionPayload {
  data?: {
    user: {
      contributionsCollection: {
        startedAt: string;
        endedAt: string;
        hasAnyRestrictedContributions: boolean;
        restrictedContributionsCount: number;
      };
    } | null;
  };
  errors?: Array<{ message: string }>;
}

const PRIVATE_CONTRIBUTIONS_QUERY = `query ($login: String!) {
  user(login: $login) {
    contributionsCollection {
      startedAt
      endedAt
      hasAnyRestrictedContributions
      restrictedContributionsCount
    }
  }
}`;

const JSON_MEDIA_TYPE = "application/vnd.github+json";
const RAW_MEDIA_TYPE = "application/vnd.github.raw+json";

/**
 * Upper bound for one outbound GitHub call. GitHub is normally fast; 10s is
 * generous for a slow-but-alive response while still failing well before the
 * platform's 60s function timeout, so a slow (not down) GitHub gives the user
 * a prompt, specific error instead of a minute-long spinner. The platform
 * timeout remains the backstop, not the primary bound.
 */
const REQUEST_TIMEOUT_MS = 10_000;

/** GitHub REST API implementation of {@link GitHubPort}. */
export class GitHubRestAdapter implements GitHubPort {
  private readonly token: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor({ token, fetch: fetchImpl, baseUrl }: GitHubRestAdapterOptions = {}) {
    this.token = token;
    this.fetchImpl = fetchImpl ?? globalThis.fetch;
    this.baseUrl = (baseUrl ?? "https://api.github.com").replace(/\/$/, "");
  }

  async listRepos(owner: string): Promise<RepoSummary[]> {
    const url = `${this.baseUrl}/users/${encodeURIComponent(owner)}/repos?type=owner&sort=pushed&per_page=100`;
    const response = await this.request(url, JSON_MEDIA_TYPE);
    await this.assertOk(response, url);

    const payload = (await response.json()) as GitHubRepoPayload[];
    return payload.map(toRepoSummary);
  }

  async getReadme(owner: string, repo: string): Promise<string | null> {
    const url = `${this.baseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`;
    return this.rawOrNull(url);
  }

  async getFile(owner: string, repo: string, path: string): Promise<string | null> {
    const encodedPath = encodeRepoPath(path);
    const url = `${this.baseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`;
    return this.rawOrNull(url);
  }

  async listFiles(owner: string, repo: string): Promise<string[]> {
    const url = `${this.baseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/HEAD?recursive=1`;
    const response = await this.request(url, JSON_MEDIA_TYPE);
    // 404: no such repository; 409: the repository is empty (no commits, no tree).
    if (response.status === 404 || response.status === 409) return [];
    await this.assertOk(response, url);

    const payload = (await response.json()) as { tree?: Array<{ path: string; type: string }> };
    return (payload.tree ?? []).filter((entry) => entry.type === "blob").map((entry) => entry.path);
  }

  /** Pull requests `author` opened outside the repositories it owns (`-user:` excludes those). */
  async listExternalPullRequests(author: string): Promise<PullRequestSummary[]> {
    return (await this.searchPullRequests(`is:pr author:${author} -user:${author}`)).items;
  }

  /** Pull requests `author` opened in the repositories it owns. */
  listOwnPullRequests(author: string): Promise<SearchPage<PullRequestSummary>> {
    return this.searchPullRequests(`is:pr author:${author} user:${author}`);
  }

  /**
   * Commits `author` authored in the repositories it owns, newest first. GitHub
   * searches each repository's default branch only. Merge commits are left out:
   * they restate pull requests, and a run of them would push the real work out
   * of the newest page.
   */
  async listOwnCommits(author: string): Promise<SearchPage<CommitSummary>> {
    const query = `author:${author} user:${author} merge:false`;
    const url = `${this.baseUrl}/search/commits?q=${encodeURIComponent(query)}&sort=author-date&order=desc&per_page=100`;
    const response = await this.request(url, JSON_MEDIA_TYPE);
    await this.assertOk(response, url);

    const payload = (await response.json()) as { total_count?: number; items?: SearchCommitPayload[] };
    const items = (payload.items ?? []).map(toCommitSummary);
    return { total: payload.total_count ?? items.length, items };
  }

  /**
   * Two searches, run in parallel: every pull request the query matches, and
   * the subset a reviewer approved, which the first search does not report.
   * Both are public-only with a token that has no scopes, which is what this
   * server uses.
   */
  private async searchPullRequests(query: string): Promise<SearchPage<PullRequestSummary>> {
    const search = `${this.baseUrl}/search/issues`;
    const [all, approved] = await Promise.all([
      this.searchIssues(`${search}?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=100`),
      this.searchIssues(`${search}?q=${encodeURIComponent(`${query} review:approved`)}&per_page=100`),
    ]);

    const approvedUrls = new Set(approved.items.map((item) => item.html_url));
    const items = all.items.map((item): PullRequestSummary => ({
      repo: new URL(item.repository_url).pathname.split("/").slice(-2).join("/"),
      number: item.number,
      title: item.title,
      url: item.html_url,
      state: item.pull_request?.merged_at ? "merged" : item.state,
      approved: approvedUrls.has(item.html_url),
      createdAt: item.created_at,
    }));
    return { total: all.total, items };
  }

  /**
   * GitHub shares this count publicly when the owner enables "private
   * contributions" on their profile, so a token with no scopes can read it - but
   * only over GraphQL, which refuses unauthenticated calls: without a token
   * there is nothing to ask. The login travels as a variable, never spliced into
   * the query text.
   */
  async getPrivateContributionCount(owner: string): Promise<PrivateContributionCount | null> {
    if (!this.token) return null;

    const url = `${this.baseUrl}/graphql`;
    const response = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        Accept: JSON_MEDIA_TYPE,
        "Content-Type": "application/json",
        "User-Agent": "portfolio-agent",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ query: PRIVATE_CONTRIBUTIONS_QUERY, variables: { login: owner } }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    await this.assertOk(response, url);

    const payload = (await response.json()) as ContributionsCollectionPayload;
    if (payload.errors?.length) {
      throw new Error(`GitHub GraphQL error: ${payload.errors.map((error) => error.message).join("; ")}`);
    }
    const collection = payload.data?.user?.contributionsCollection;
    if (!collection?.hasAnyRestrictedContributions || collection.restrictedContributionsCount === 0) return null;

    // The period starts at midnight in the owner's time zone, so its UTC time of
    // day is that zone's offset; shifting both ends by it gives the local days.
    const offset = midnightOffsetMs(collection.startedAt);
    return {
      count: collection.restrictedContributionsCount,
      from: localDay(collection.startedAt, offset),
      to: localDay(collection.endedAt, offset),
    };
  }

  private async searchIssues(url: string): Promise<SearchPage<SearchIssuePayload>> {
    const response = await this.request(url, JSON_MEDIA_TYPE);
    await this.assertOk(response, url);
    const payload = (await response.json()) as { total_count?: number; items?: SearchIssuePayload[] };
    const items = payload.items ?? [];
    return { total: payload.total_count ?? items.length, items };
  }

  private async rawOrNull(url: string): Promise<string | null> {
    const response = await this.request(url, RAW_MEDIA_TYPE);
    if (response.status === 404) return null;
    await this.assertOk(response, url);
    return response.text();
  }

  private request(url: string, accept: string): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: accept,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "portfolio-agent",
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    return this.fetchImpl(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  }

  private async assertOk(response: Response, url: string): Promise<void> {
    if (response.ok) return;

    let message = response.statusText;
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // Non-JSON error body: keep the status text.
    }

    throw new Error(`GitHub API ${response.status} for ${url}: ${message}`);
  }
}

/**
 * Encodes a repository-relative file path for the contents API.
 * Only plain, non-empty segments are allowed: `.` and `..` would be forwarded
 * to GitHub unchanged, and empty segments or a leading slash would change
 * the request shape, so all of them are rejected up front.
 */
function encodeRepoPath(path: string): string {
  const segments = path.split("/");
  const valid =
    segments.length > 0 && segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
  if (!valid) {
    throw new Error(`Invalid repository file path: "${path}".`);
  }
  return segments.map(encodeURIComponent).join("/");
}

const DAY_MS = 86_400_000;

/** How far local midnight sits from UTC midnight, in (-12 h, +12 h]: 03:00Z gives +3 h (UTC-3). */
function midnightOffsetMs(localMidnight: string): number {
  const timeOfDay = ((Date.parse(localMidnight) % DAY_MS) + DAY_MS) % DAY_MS;
  return timeOfDay > DAY_MS / 2 ? timeOfDay - DAY_MS : timeOfDay;
}

function localDay(instant: string, offsetMs: number): string {
  return new Date(Date.parse(instant) - offsetMs).toISOString().slice(0, 10);
}

function toCommitSummary(item: SearchCommitPayload): CommitSummary {
  return {
    repo: item.repository.full_name,
    sha: item.sha.slice(0, 7),
    message: item.commit.message.split("\n", 1)[0] ?? "",
    date: item.commit.author.date,
    url: item.html_url,
  };
}

function toRepoSummary(repo: GitHubRepoPayload): RepoSummary {
  return {
    name: repo.name,
    fullName: repo.full_name,
    description: repo.description,
    language: repo.language,
    stars: repo.stargazers_count,
    updatedAt: repo.pushed_at ?? repo.updated_at,
    url: repo.html_url,
    topics: repo.topics ?? [],
    isFork: repo.fork,
    isArchived: repo.archived,
  };
}
