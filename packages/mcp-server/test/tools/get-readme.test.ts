import { describe, expect, it } from "vitest";

import { getReadme } from "../../src/tools/get-readme.ts";
import { FakeGitHub } from "../fake-github.ts";

const github = new FakeGitHub({
  readmes: {
    "octocat/documented": "# Documented\n\nA project with a README.",
    "octocat/long": "x".repeat(20_000),
  },
});

describe("getReadme", () => {
  it("returns the README content when it exists", async () => {
    const result = await getReadme(github, { owner: "octocat", repo: "documented" });

    expect(result).toEqual({
      owner: "octocat",
      repo: "documented",
      found: true,
      content: "# Documented\n\nA project with a README.",
      truncated: false,
    });
  });

  it("returns a friendly not-found result instead of throwing", async () => {
    const result = await getReadme(github, { owner: "octocat", repo: "undocumented" });

    expect(result).toEqual({
      owner: "octocat",
      repo: "undocumented",
      found: false,
      message: "No README found for octocat/undocumented.",
    });
  });

  it("truncates long READMEs to `maxChars` and flags it", async () => {
    const result = await getReadme(github, { owner: "octocat", repo: "long", maxChars: 100 });

    expect(result.found).toBe(true);
    if (!result.found) throw new Error("unreachable");
    expect(result.content).toHaveLength(100);
    expect(result.truncated).toBe(true);
  });

  it("uses a 12k character default cap", async () => {
    const result = await getReadme(github, { owner: "octocat", repo: "long" });

    if (!result.found) throw new Error("unreachable");
    expect(result.content).toHaveLength(12_000);
    expect(result.truncated).toBe(true);
  });
});
