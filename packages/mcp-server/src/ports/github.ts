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

export interface GitHubPort {
  /** Public repositories owned by `owner`, forks included. */
  listRepos(owner: string): Promise<RepoSummary[]>;
  /** Raw README markdown, or `null` when the repository has none. */
  getReadme(owner: string, repo: string): Promise<string | null>;
  /** Raw file content at `path`, or `null` when it does not exist. */
  getFile(owner: string, repo: string, path: string): Promise<string | null>;
}
