import type { GitHubPort, PullRequestState } from "../ports/github.ts";
import { ToolInputError } from "../validation.ts";

export interface ListContributionsInput {
  owner: string;
  /**
   * Only pull requests to repositories whose `owner/name` contains this text,
   * case-insensitively: an organization or project the question names.
   */
  project?: string;
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

export interface RepositoryContributions {
  repo: string;
  merged: number;
  open: number;
  closed: number;
  pullRequests: ContributionItem[];
}

export type ListContributionsResult = {
  owner: string;
  /** The project filter as applied (trimmed, lower-case), when one was given. */
  project?: string;
  /** Pull requests found before applying `limit`. */
  total: number;
  /** How many of them were merged. */
  merged: number;
  /**
   * Repositories in order of most recent activity, each with its pull requests
   * and their counts by state: "did they get one merged in X?" is read off a
   * number instead of counted by the model, which it was observed to get wrong.
   */
  repositories: RepositoryContributions[];
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
 * For a named project with no public match, the result answers the question
 * itself: the owner wants "private, cannot be shown", and nothing in it may read
 * as evidence that no contribution exists.
 */
const unmatchedProjectNote = (project: string) =>
  `Contributions to private repositories cannot be shown, and any to "${project}" would be private. ` +
  "Answer exactly that for this project.";

/** An organization or repository name, optionally `owner/name`: what GitHub allows in either. */
const PROJECT_PATTERN = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9._-]+)?$/;

/**
 * The owner's contributions to repositories it does not own: open source
 * projects, organizations and teammates' repos. Grouped by repository so the
 * model can say "3 pull requests to gentle-ai, 1 merged" without counting.
 */
export async function listContributions(
  github: GitHubPort,
  { owner, project, limit = DEFAULT_CONTRIBUTION_LIMIT }: ListContributionsInput,
): Promise<ListContributionsResult> {
  if (limit < 1) {
    throw new ToolInputError(`Invalid limit: ${limit}. Must be a positive number.`);
  }
  const filter = project === undefined ? undefined : normalizeProject(project);

  const all = (await github.listExternalPullRequests(owner)).filter(
    ({ repo }) => filter === undefined || repo.toLowerCase().includes(filter),
  );

  const repositories: RepositoryContributions[] = [];
  for (const { repo, ...pullRequest } of all.slice(0, limit)) {
    let group = repositories.find((entry) => entry.repo === repo);
    if (!group) {
      group = { repo, merged: 0, open: 0, closed: 0, pullRequests: [] };
      repositories.push(group);
    }
    group[pullRequest.state] += 1;
    group.pullRequests.push(pullRequest);
  }

  return {
    owner,
    ...(filter === undefined ? {} : { project: filter }),
    total: all.length,
    merged: all.filter((pullRequest) => pullRequest.state === "merged").length,
    repositories,
    note: filter !== undefined && all.length === 0 ? unmatchedProjectNote(filter) : PUBLIC_ONLY_NOTE,
  };
}

function normalizeProject(raw: string): string {
  const project = raw.trim().toLowerCase();
  if (!PROJECT_PATTERN.test(project)) {
    throw new ToolInputError(`Invalid project: "${raw}". Use an organization or repository name.`);
  }
  return project;
}
