import { CachingGitHubPort } from "@portfolio-agent/mcp-server";
import { describe, expect, it } from "vitest";

import { sharedGitHubPort } from "./github";

describe("sharedGitHubPort", () => {
  it("is one cached port shared by every request with the same token", () => {
    const first = sharedGitHubPort({ GITHUB_TOKEN: "a" });

    expect(first).toBeInstanceOf(CachingGitHubPort);
    expect(sharedGitHubPort({ GITHUB_TOKEN: "a" })).toBe(first);
  });

  it("starts a fresh cache when the token changes, so answers never cross tokens", () => {
    const withA = sharedGitHubPort({ GITHUB_TOKEN: "a" });

    expect(sharedGitHubPort({ GITHUB_TOKEN: "b" })).not.toBe(withA);
  });
});
