/**
 * Outbound port for everything the tools need from GitHub.
 *
 * Tools depend on this interface only, never on the HTTP API directly,
 * so they can be unit-tested with an in-memory fake and the transport
 * can be swapped (REST today, GraphQL or a cache tomorrow).
 */
export interface RepoSummary {
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  stars: number;
  /** ISO timestamp of the last push. */
  updatedAt: string;
  url: string;
  topics: string[];
  isFork: boolean;
  isArchived: boolean;
}

export type PullRequestState = "open" | "closed" | "merged";

export interface PullRequestSummary {
  /** Repository the pull request was opened against, as `owner/name`. */
  repo: string;
  number: number;
  title: string;
  url: string;
  state: PullRequestState;
  /** A reviewer approved it on GitHub. */
  approved: boolean;
  /** ISO timestamp of when it was opened. */
  createdAt: string;
}

export interface CommitSummary {
  /** Repository the commit belongs to, as `owner/name`. */
  repo: string;
  /** Abbreviated SHA, as GitHub shows it. */
  sha: string;
  /** First line of the commit message. */
  message: string;
  /** ISO timestamp of when it was authored. */
  date: string;
  url: string;
}

/** The newest results of a GitHub search, and how many it found in total (a page holds at most 100). */
export interface SearchPage<T> {
  total: number;
  items: T[];
}

/**
 * GitHub's own count of an owner's contributions to private repositories, as
 * shown on their public profile. It says how many, never which repositories.
 */
export interface PrivateContributionCount {
  count: number;
  /** First and last day of the counted period (GitHub's default: the last year), `YYYY-MM-DD`. */
  from: string;
  to: string;
}

export interface GitHubPort {
  /** Public repositories owned by `owner`, forks included. */
  listRepos(owner: string): Promise<RepoSummary[]>;
  /** Raw README markdown, or `null` when the repository has none. */
  getReadme(owner: string, repo: string): Promise<string | null>;
  /** Raw file content at `path`, or `null` when it does not exist. */
  getFile(owner: string, repo: string, path: string): Promise<string | null>;
  /**
   * Public pull requests `author` opened in repositories it does not own -
   * open source projects, organizations, teammates' repos - newest activity first.
   */
  listExternalPullRequests(author: string): Promise<PullRequestSummary[]>;
  /** `null` when the owner does not share private contribution counts on their profile. */
  getPrivateContributionCount(owner: string): Promise<PrivateContributionCount | null>;
  /** Public pull requests `author` opened in repositories it owns, newest activity first. */
  listOwnPullRequests(author: string): Promise<SearchPage<PullRequestSummary>>;
  /** Public commits `author` authored in repositories it owns, newest first, merge commits excluded. */
  listOwnCommits(author: string): Promise<SearchPage<CommitSummary>>;
  /** Every file (blob) path at the default branch HEAD; `[]` when the repository is empty or not found. */
  listFiles(owner: string, repo: string): Promise<string[]>;
}
