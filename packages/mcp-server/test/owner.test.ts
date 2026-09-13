import { describe, expect, it } from "vitest";

import { DEFAULT_OWNER, resolveOwner } from "../src/owner.ts";
import { validateOwner, validateRepo } from "../src/validation.ts";

describe("resolveOwner", () => {
  it("falls back to DEFAULT_OWNER when GITHUB_OWNER is unset or blank", () => {
    expect(resolveOwner({})).toBe(DEFAULT_OWNER);
    expect(resolveOwner({ GITHUB_OWNER: "   " })).toBe(DEFAULT_OWNER);
  });

  it("uses a trimmed GITHUB_OWNER", () => {
    expect(resolveOwner({ GITHUB_OWNER: "  octocat " })).toBe("octocat");
  });

  it("rejects an invalid GITHUB_OWNER and names the variable", () => {
    expect(() => resolveOwner({ GITHUB_OWNER: "not a login" })).toThrow(/GITHUB_OWNER/);
  });
});

describe("validateOwner", () => {
  it("accepts GitHub login names", () => {
    expect(validateOwner("a")).toBe("a");
    expect(validateOwner("octo-cat")).toBe("octo-cat");
    expect(validateOwner(" Octocat42 ")).toBe("Octocat42");
    expect(validateOwner("a".repeat(39))).toBe("a".repeat(39));
  });

  it("rejects names outside the GitHub login rules", () => {
    for (const bad of ["", "-start", "end-", "double--hyphen", "a".repeat(40), "with space", "under_score"]) {
      expect(() => validateOwner(bad), bad).toThrow(/owner/i);
    }
  });
});

describe("validateRepo", () => {
  it("accepts GitHub repository names", () => {
    expect(validateRepo("portfolio")).toBe("portfolio");
    expect(validateRepo(" my_repo.v2-final ")).toBe("my_repo.v2-final");
    expect(validateRepo("a".repeat(100))).toBe("a".repeat(100));
  });

  it("rejects traversal names, separators and oversized names", () => {
    for (const bad of ["", ".", "..", "../etc", "a/b", "a".repeat(101), "with space"]) {
      expect(() => validateRepo(bad), bad).toThrow(/repository/i);
    }
  });
});
