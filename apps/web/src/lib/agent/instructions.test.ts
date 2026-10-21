import { describe, expect, it } from "vitest";

import { MAX_AGENT_STEPS, buildInstructions, stepSettings } from "./instructions";

describe("buildInstructions", () => {
  it("names the portfolio owner and the available tools", () => {
    const instructions = buildInstructions("octocat");

    expect(instructions).toContain("octocat");
    expect(instructions).toContain("list_repos");
    expect(instructions).toContain("get_readme");
    expect(instructions).toContain("detect_stack");
    expect(instructions).toContain("list_contributions");
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

  it("tells the model its turn budget, so it batches tool calls instead of spending turns", () => {
    expect(buildInstructions("octocat")).toContain(`at most ${MAX_AGENT_STEPS} turns`);
  });

  it("answers a question about an unlisted project with 'private, cannot be shown' and nothing else", () => {
    // Observed: asked about pull requests to a company's private repos, the model
    // opened with "there is no PR to that organization" and only then added the
    // caveat, which reads as a denial. The owner's ask: say they are private and stop.
    const instructions = buildInstructions("octocat");

    expect(instructions).toMatch(/private repositories cannot be shown/i);
    expect(instructions).toMatch(/do not say there are none/i);
    expect(instructions).toMatch(/do not list other contributions instead/i);
    // The filter is what lets the tool itself return that answer for the project.
    expect(instructions).toMatch(/project set to/i);
  });

  it("answers about private work with GitHub's count only, never naming or guessing repositories", () => {
    // The owner's ask: the data must come from GitHub, not from anything that reads
    // as an answer the owner planted ("he says he worked on X").
    const instructions = buildInstructions("octocat");

    expect(instructions).toMatch(/privateContributions/);
    expect(instructions).toMatch(/never name or guess the repositories/i);
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

describe("stepSettings", () => {
  it("forbids tool calls on the last step only, so every question ends with an answer", () => {
    // Observed: asked "Which repositories use Next.js?", the model called
    // detect_stack one repository per turn, spent all the steps and never answered.
    expect(stepSettings(MAX_AGENT_STEPS - 1)).toEqual({ toolChoice: "none" });
    expect(stepSettings(MAX_AGENT_STEPS - 2)).toBeUndefined();
    expect(stepSettings(0)).toBeUndefined();
  });
});
