export {
  CachingGitHubPort,
  type CachingGitHubPortOptions,
} from "./adapters/caching-github.ts";
export { GitHubRestAdapter, type GitHubRestAdapterOptions } from "./adapters/github-rest.ts";
export { DEFAULT_OWNER, resolveOwner } from "./owner.ts";
export {
  DEFAULT_PROFILE,
  type Profile,
  type ProfileEducation,
  type ProfileExperience,
  type ProfileProject,
  type ProfileSource,
} from "./profile.ts";
export type {
  CommitSummary,
  GitHubPort,
  PrivateContributionCount,
  PullRequestState,
  PullRequestSummary,
  RepoSummary,
  SearchPage,
} from "./ports/github.ts";
export {
  SERVER_NAME,
  SERVER_VERSION,
  createPortfolioMcpServer,
  registerPortfolioTools,
  type PortfolioServerDeps,
} from "./server.ts";
export { detectStack, type DetectStackInput, type StackReport } from "./tools/detect-stack.ts";
export {
  PROFILE_SECTIONS,
  getProfile,
  type GetProfileInput,
  type GetProfileResult,
  type ProfileSection,
} from "./tools/get-profile.ts";
export { getReadme, type GetReadmeInput, type GetReadmeResult } from "./tools/get-readme.ts";
export { listActivity, type ListActivityInput, type ListActivityResult } from "./tools/list-activity.ts";
export {
  listContributions,
  type ListContributionsInput,
  type ListContributionsResult,
} from "./tools/list-contributions.ts";
export { listRepos, type ListReposInput, type ListReposResult } from "./tools/list-repos.ts";
export { ToolInputError, validateOwner, validateRepo } from "./validation.ts";
