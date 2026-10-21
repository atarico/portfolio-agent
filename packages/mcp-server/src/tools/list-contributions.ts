import type { GitHubPort, PullRequestState } from "../ports/github.ts";
import { ToolInputError } from "../validation.ts";

export interface ListContributionsInput {
  owner: string;
  /** Maximum number of pull requests to return, most recent first. Defaults to DEFAULT_CONTRIBUTION_LIMIT. */
  limit?: number;
}

export interface ContributionItem {
  number: number;
  title: string;
  url: string;
  state: PullRequestState;
  approved: boolean;
  createdAt: string;
}

export type ListContributionsResult = {
  owner: string;
  /** Pull requests found before applying `limit`. */
  total: number;
  /** How many of them were merged. */
  merged: number;
  /** Repositories in order of most recent activity, each with its pull requests. */
  repositories: Array<{ repo: string; pullRequests: ContributionItem[] }>;
  note: string;
};

export const DEFAULT_CONTRIBUTION_LIMIT = 30;

/**
 * Stated on every result: with a token that has no scopes, contributions to
 * private repositories (a company's, a client's) cannot be seen, and the model
 * must not present "not listed" as "never happened".
 */
const PUBLIC_ONLY_NOTE =
  "Only public pull requests are visible. Contributions to private repositories do not appear here.";

/**
 * The owner's contributions to repositories it does not own: open source
 * projects, organizations and teammates' repos. Grouped by repository so the
 * model can say "3 pull requests to gentle-ai, 1 merged" without counting.
 */
export async function listContributions(
  github: GitHubPort,
  { owner, limit = DEFAULT_CONTRIBUTION_LIMIT }: ListContributionsInput,
): Promise<ListContributionsResult> {
  if (limit < 1) {
    throw new ToolInputError(`Invalid limit: ${limit}. Must be a positive number.`);
  }

  const all = await github.listExternalPullRequests(owner);

  const repositories: ListContributionsResult["repositories"] = [];
  for (const { repo, ...pullRequest } of all.slice(0, limit)) {
    const group = repositories.find((entry) => entry.repo === repo);
    if (group) group.pullRequests.push(pullRequest);
    else repositories.push({ repo, pullRequests: [pullRequest] });
  }

  return {
    owner,
    total: all.length,
    merged: all.filter((pullRequest) => pullRequest.state === "merged").length,
    repositories,
    note: PUBLIC_ONLY_NOTE,
  };
}
