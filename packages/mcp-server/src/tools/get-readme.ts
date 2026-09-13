import type { GitHubPort } from "../ports/github.ts";

export interface GetReadmeInput {
  owner: string;
  repo: string;
  /** Upper bound on returned characters, to keep LLM context small. Defaults to DEFAULT_README_MAX_CHARS. */
  maxChars?: number;
}

export type GetReadmeResult =
  | { owner: string; repo: string; found: true; content: string; truncated: boolean }
  | { owner: string; repo: string; found: false; message: string };

export const DEFAULT_README_MAX_CHARS = 12_000;

export async function getReadme(
  github: GitHubPort,
  { owner, repo, maxChars = DEFAULT_README_MAX_CHARS }: GetReadmeInput,
): Promise<GetReadmeResult> {
  const readme = await github.getReadme(owner, repo);

  if (readme === null) {
    return { owner, repo, found: false, message: `No README found for ${owner}/${repo}.` };
  }

  const truncated = readme.length > maxChars;

  return {
    owner,
    repo,
    found: true,
    content: truncated ? readme.slice(0, maxChars) : readme,
    truncated,
  };
}
