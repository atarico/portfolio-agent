import type { GitHubPort } from "../ports/github.ts";
import { ToolInputError } from "../validation.ts";

export interface ListReposInput {
  owner: string;
  /** Include forked repositories. Defaults to `false`. */
  includeForks?: boolean;
  /** Maximum number of repositories to return. Must be a positive number. Defaults to DEFAULT_REPO_LIMIT. */
  limit?: number;
}

export interface RepoListItem {
  name: string;
  description: string | null;
  language: string | null;
  stars: number;
  updatedAt: string;
  url: string;
  topics: string[];
  isArchived: boolean;
}

export type ListReposResult = {
  owner: string;
  /** Number of matching repositories before applying `limit`. */
  total: number;
  repos: RepoListItem[];
};

export const DEFAULT_REPO_LIMIT = 30;

export async function listRepos(
  github: GitHubPort,
  { owner, includeForks = false, limit = DEFAULT_REPO_LIMIT }: ListReposInput,
): Promise<ListReposResult> {
  if (limit < 1) {
    throw new ToolInputError(`Invalid limit: ${limit}. Must be a positive number.`);
  }

  const all = await github.listRepos(owner);

  const matching = all
    .filter((repo) => includeForks || !repo.isFork)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const repos = matching.slice(0, limit).map<RepoListItem>((repo) => ({
    name: repo.name,
    description: repo.description,
    language: repo.language,
    stars: repo.stars,
    updatedAt: repo.updatedAt,
    url: repo.url,
    topics: repo.topics,
    isArchived: repo.isArchived,
  }));

  return { owner, total: matching.length, repos };
}
