import type { GitHubPort } from "../ports/github.ts";
import { ToolInputError } from "../validation.ts";

export interface GetReadmeInput {
  owner: string;
  repo: string;
  /**
   * Upper bound on returned characters, measured in UTF-16 code units (not
   * Unicode codepoints — a character outside the Basic Multilingual Plane,
   * such as most emoji, counts as two), to keep LLM context small. Defaults
   * to DEFAULT_README_MAX_CHARS. Must be a positive number.
   */
  maxChars?: number;
}

export type GetReadmeResult =
  | { owner: string; repo: string; found: true; content: string; truncated: boolean }
  | { owner: string; repo: string; found: false; message: string };

/**
 * Default cap on README size. 4,000 characters is about 1.1k tokens (12,000
 * was about 3.4k): enough for the pitch and the stack of a project, while the
 * free LLM tiers this agent runs on cap throughput at ~8,000 tokens/minute and
 * every extra README competes with the rest of the conversation. The model can
 * still ask for more through `maxChars` (up to 50,000) when it needs detail.
 */
export const DEFAULT_README_MAX_CHARS = 4_000;

/**
 * If truncation left an unpaired UTF-16 high surrogate as the last code
 * unit, drop it. `String.prototype.slice` cuts on code units, not
 * codepoints, so a surrogate pair (used for any character outside the Basic
 * Multilingual Plane, including most emoji) can be split exactly at the
 * boundary, leaving a lone high surrogate that becomes invalid Unicode
 * (U+FFFD) once serialized.
 */
function dropTrailingHighSurrogate(text: string): string {
  const lastUnit = text.charCodeAt(text.length - 1);
  const isHighSurrogate = lastUnit >= 0xd800 && lastUnit <= 0xdbff;
  return isHighSurrogate ? text.slice(0, -1) : text;
}

export async function getReadme(
  github: GitHubPort,
  { owner, repo, maxChars = DEFAULT_README_MAX_CHARS }: GetReadmeInput,
): Promise<GetReadmeResult> {
  if (maxChars < 1) {
    throw new ToolInputError(`Invalid maxChars: ${maxChars}. Must be a positive number.`);
  }

  const readme = await github.getReadme(owner, repo);

  if (readme === null) {
    return { owner, repo, found: false, message: `No README found for ${owner}/${repo}.` };
  }

  const truncated = readme.length > maxChars;

  return {
    owner,
    repo,
    found: true,
    content: truncated ? dropTrailingHighSurrogate(readme.slice(0, maxChars)) : readme,
    truncated,
  };
}
