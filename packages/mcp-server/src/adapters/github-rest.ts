import type { GitHubPort, RepoSummary } from "../ports/github.ts";

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
