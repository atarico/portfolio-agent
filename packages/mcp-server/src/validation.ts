/**
 * Input validation shared by every tool entry point.
 *
 * Both patterns encode GitHub's own naming rules so that invalid names are
 * rejected before any request leaves the process.
 */

/**
 * GitHub login rules: 1-39 characters, alphanumeric or single hyphens,
 * and a hyphen can neither start, end nor repeat.
 * The lookahead enforces the length; the body enforces the hyphen rules.
 */
const OWNER_PATTERN = /^(?=.{1,39}$)[A-Za-z0-9](?:-?[A-Za-z0-9])*$/;

/**
 * GitHub repository rules: 1-100 characters from letters, digits, `-`, `_`
 * and `.`; the names `.` and `..` are reserved (the negative lookahead
 * rejects them so path traversal is impossible by construction).
 */
const REPO_PATTERN = /^(?!\.\.?$)[A-Za-z0-9_.-]{1,100}$/;

/** Raised for caller input that fails validation; safe to show to the model. */
export class ToolInputError extends Error {
  override readonly name = "ToolInputError";
}

export function validateOwner(owner: string): string {
  const value = owner.trim();
  if (!OWNER_PATTERN.test(value)) {
    throw new ToolInputError(`Invalid GitHub owner: "${value}".`);
  }
  return value;
}

export function validateRepo(repo: string): string {
  const value = repo.trim();
  if (!REPO_PATTERN.test(value)) {
    throw new ToolInputError(`Invalid repository name: "${value}".`);
  }
  return value;
}
