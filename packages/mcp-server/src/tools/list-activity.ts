import type { CommitSummary, GitHubPort, PullRequestSummary } from "../ports/github.ts";
import { ToolInputError } from "../validation.ts";

export interface ListActivityInput {
  owner: string;
  /** Maximum commits and pull requests to return, most recent first. Defaults to DEFAULT_ACTIVITY_LIMIT. */
  limit?: number;
}

export type ListActivityResult = {
  owner: string;
  commits: {
    /** Every public commit GitHub found, not only the ones returned. */
    total: number;
    recent: CommitSummary[];
  };
  pullRequests: {
    /** Every public pull request GitHub found, not only the ones counted or returned. */
    total: number;
    /**
     * How many of the newest pull requests `merged`, `open` and `closed` count:
     * GitHub returns at most 100, so they are a sample once `total` is larger.
     */
    counted: number;
    merged: number;
    open: number;
    closed: number;
    recent: PullRequestSummary[];
  };
  note: string;
};

export const DEFAULT_ACTIVITY_LIMIT = 10;

/**
 * Stated on every result, for the same reason as list_contributions: work in
 * private repositories cannot be seen, and "not listed" must not read as "never
 * happened".
 */
const ACTIVITY_NOTE =
  "Only public repositories the owner owns are covered, and commits on each repository's default branch only. " +
  "Work in private repositories does not appear here. When pullRequests.total is larger than counted, " +
  "merged, open and closed describe the newest pull requests, not all of them.";

/**
 * The owner's recent work in the repositories it owns: the newest commits, and
 * the pull requests it opened there with their counts by state, so "do they
 * work with pull requests?" is read off a number instead of counted by the
 * model. Pull requests to other people's repositories belong to
 * list_contributions.
 */
export async function listActivity(
  github: GitHubPort,
  { owner, limit = DEFAULT_ACTIVITY_LIMIT }: ListActivityInput,
): Promise<ListActivityResult> {
  if (limit < 1) {
    throw new ToolInputError(`Invalid limit: ${limit}. Must be a positive number.`);
  }

  const [commits, pullRequests] = await Promise.all([github.listOwnCommits(owner), github.listOwnPullRequests(owner)]);
  const countState = (state: PullRequestSummary["state"]) =>
    pullRequests.items.filter((pullRequest) => pullRequest.state === state).length;

  return {
    owner,
    commits: { total: commits.total, recent: commits.items.slice(0, limit) },
    pullRequests: {
      total: pullRequests.total,
      counted: pullRequests.items.length,
      merged: countState("merged"),
      open: countState("open"),
      closed: countState("closed"),
      recent: pullRequests.items.slice(0, limit),
    },
    note: ACTIVITY_NOTE,
  };
}
