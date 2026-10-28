import { DEFAULT_OWNER } from "@portfolio-agent/mcp-server";
import { describe, expect, it } from "vitest";

import { ownerDisplayName } from "./owner-name";

describe("ownerDisplayName", () => {
  it("uses the name on the CV for the owner it belongs to", () => {
    expect(ownerDisplayName(DEFAULT_OWNER)).toBe("Agustín Tarico");
  });

  it("matches the owner case-insensitively, as GitHub logins are", () => {
    expect(ownerDisplayName(DEFAULT_OWNER.toUpperCase())).toBe("Agustín Tarico");
  });

  it("falls back to the GitHub login for any other owner, so one person's name is never shown as another's", () => {
    expect(ownerDisplayName("octocat")).toBe("octocat");
  });
});
