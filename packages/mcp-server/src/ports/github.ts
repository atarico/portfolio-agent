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
  /** Every file (blob) path at the default branch HEAD; `[]` when the repository is empty or not found. */
  listFiles(owner: string, repo: string): Promise<string[]>;
}
