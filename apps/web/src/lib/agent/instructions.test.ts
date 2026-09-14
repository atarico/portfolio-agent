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

  it("tells the model to skip discovery when the question already names a repository", () => {
    // The observed waste: asked about a repo by name, the model still called
    // list_repos first and spent a whole round-trip finding what it was given.
    expect(buildInstructions("octocat")).toMatch(/already names|names a repository|straight to/i);
  });

  it("tells the model that several tools may be requested in the same turn", () => {
    // What costs quota is round-trips, not tool calls. Two tools in one turn is
    // half the price of one tool in each of two turns.
    expect(buildInstructions("octocat")).toMatch(/same turn|at once|together/i);
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
