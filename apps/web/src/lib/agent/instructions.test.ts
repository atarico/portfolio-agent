import { describe, expect, it } from "vitest";

import { MAX_AGENT_STEPS, buildInstructions } from "./instructions";

describe("buildInstructions", () => {
  it("names the portfolio owner and the available tools", () => {
    const instructions = buildInstructions("octocat");

    expect(instructions).toContain("octocat");
    expect(instructions).toContain("list_repos");
    expect(instructions).toContain("get_readme");
    expect(instructions).toContain("detect_stack");
  });

  it("tells the model to admit when it does not know", () => {
    expect(buildInstructions("octocat")).toMatch(/do not know|don't know|not sure/i);
  });
});

describe("MAX_AGENT_STEPS", () => {
  it("keeps one question within a free-tier friendly budget", () => {
    expect(MAX_AGENT_STEPS).toBeGreaterThanOrEqual(3);
    expect(MAX_AGENT_STEPS).toBeLessThanOrEqual(8);
  });
});
