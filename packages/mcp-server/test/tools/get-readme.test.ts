import { describe, expect, it } from "vitest";

import { getReadme } from "../../src/tools/get-readme.ts";
import { ToolInputError } from "../../src/validation.ts";
import { FakeGitHub } from "../fake-github.ts";

const EMOJI = "😀"; // U+1F600, encoded in UTF-16 as the surrogate pair 0xD83D 0xDE00.

const github = new FakeGitHub({
  readmes: {
    "octocat/documented": "# Documented\n\nA project with a README.",
    "octocat/long": "x".repeat(20_000),
    // Positions the emoji's high surrogate as the last code unit at maxChars=100.
    "octocat/emoji-boundary": `${"x".repeat(99)}${EMOJI}${"y".repeat(50)}`,
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

  it("drops a trailing high surrogate left by truncation instead of returning an unpaired one", async () => {
    const result = await getReadme(github, { owner: "octocat", repo: "emoji-boundary", maxChars: 100 });

    expect(result.found).toBe(true);
    if (!result.found) throw new Error("unreachable");
    expect(result.truncated).toBe(true);
    // The high surrogate at code unit 99 is dropped rather than kept unpaired.
    expect(result.content).toBe("x".repeat(99));

    const lastCodeUnit = result.content.charCodeAt(result.content.length - 1);
    expect(lastCodeUnit).toBeLessThan(0xd800);

    const roundTripped = Buffer.from(result.content, "utf-8").toString("utf-8");
    expect(roundTripped).toBe(result.content);
  });

  it("rejects a non-positive maxChars instead of silently misreporting truncation", async () => {
    await expect(getReadme(github, { owner: "octocat", repo: "documented", maxChars: 0 })).rejects.toThrow(
      ToolInputError,
    );
    await expect(getReadme(github, { owner: "octocat", repo: "documented", maxChars: -1 })).rejects.toThrow(
      ToolInputError,
    );
  });
});
