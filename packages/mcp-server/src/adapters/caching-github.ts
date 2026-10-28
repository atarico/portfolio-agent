import type {
  CommitSummary,
  GitHubPort,
  PrivateContributionCount,
  PullRequestSummary,
  RepoSummary,
  SearchPage,
} from "../ports/github.ts";

/**
 * How long a GitHub answer is reused. Portfolio repositories change rarely
 * and a demo asks the same things repeatedly, so 10 minutes keeps answers
 * fresh enough while sparing the unauthenticated 60 requests/hour budget.
 */
export const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;

/** Upper bound on remembered answers so a long-lived process cannot grow without limit. */
export const DEFAULT_CACHE_MAX_ENTRIES = 500;

export interface CachingGitHubPortOptions {
  ttlMs?: number;
  maxEntries?: number;
  /** Clock, injectable for tests. Defaults to `Date.now`. */
  now?: () => number;
}

interface CacheEntry {
  expiresAt: number;
  value: Promise<unknown>;
}

/**
 * Decorator that memoizes a {@link GitHubPort}.
 *
 * Why: every agent question costs 1-6 GitHub reads and unauthenticated GitHub
 * allows 60 requests/hour, so a demo that repeats questions must not burn that
 * budget or wait on the network.
 *
 * - Successful results are cached per method + arguments, `null` included
 *   (a missing README is a stable answer).
 * - Rejections are never cached: a failed call is retried on the next request.
 * - Concurrent identical calls share one in-flight promise.
 * - When full, the oldest entry (Map insertion order) is evicted.
 */
export class CachingGitHubPort implements GitHubPort {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(
    private readonly inner: GitHubPort,
    { ttlMs = DEFAULT_CACHE_TTL_MS, maxEntries = DEFAULT_CACHE_MAX_ENTRIES, now = Date.now }: CachingGitHubPortOptions = {},
  ) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.now = now;
  }

  listRepos(owner: string): Promise<RepoSummary[]> {
    return this.cached(["listRepos", owner], () => this.inner.listRepos(owner));
  }

  getReadme(owner: string, repo: string): Promise<string | null> {
    return this.cached(["getReadme", owner, repo], () => this.inner.getReadme(owner, repo));
  }

  getFile(owner: string, repo: string, path: string): Promise<string | null> {
    return this.cached(["getFile", owner, repo, path], () => this.inner.getFile(owner, repo, path));
  }

  listExternalPullRequests(author: string): Promise<PullRequestSummary[]> {
    return this.cached(["listExternalPullRequests", author], () => this.inner.listExternalPullRequests(author));
  }

  getPrivateContributionCount(owner: string): Promise<PrivateContributionCount | null> {
    return this.cached(["getPrivateContributionCount", owner], () => this.inner.getPrivateContributionCount(owner));
  }

  listOwnPullRequests(author: string): Promise<SearchPage<PullRequestSummary>> {
    return this.cached(["listOwnPullRequests", author], () => this.inner.listOwnPullRequests(author));
  }

  listOwnCommits(author: string): Promise<SearchPage<CommitSummary>> {
    return this.cached(["listOwnCommits", author], () => this.inner.listOwnCommits(author));
  }

  listFiles(owner: string, repo: string): Promise<string[]> {
    return this.cached(["listFiles", owner, repo], () => this.inner.listFiles(owner, repo));
  }

  private cached<T>(keyParts: string[], load: () => Promise<T>): Promise<T> {
    const key = JSON.stringify(keyParts);
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > this.now()) return hit.value as Promise<T>;

    // Drop an expired entry first so re-inserting moves it to the newest slot.
    this.entries.delete(key);
    const entry: CacheEntry = { expiresAt: this.now() + this.ttlMs, value: load() };
    entry.value.catch(() => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
    });
    this.entries.set(key, entry);

    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    return entry.value as Promise<T>;
  }
}
