import { describe, expect, it } from "vitest";

import { MAX_AGENT_STEPS, MAX_OUTPUT_TOKENS, buildInstructions, stepSettings } from "./instructions";

describe("buildInstructions", () => {
  it("names the portfolio owner and the available tools", () => {
    const instructions = buildInstructions("octocat");

    expect(instructions).toContain("octocat");
    expect(instructions).toContain("list_repos");
    expect(instructions).toContain("get_readme");
    expect(instructions).toContain("detect_stack");
    expect(instructions).toContain("list_contributions");
    expect(instructions).toContain("list_activity");
    expect(instructions).toContain("get_profile");
  });

  it("sends questions about recent work and commits to list_activity, not to a refusal", () => {
    // Observed: "cual fue el ultimo commit que hizo??" was declined as unrelated,
    // and "hace PR a sus propios proyectos?" got "the tools cannot see that".
    expect(buildInstructions("octocat")).toMatch(/commits[^\n]*list_activity|list_activity[^\n]*commits/i);
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

  it("tells the model to decline requests unrelated to the owner's career and projects", () => {
    // The chat is public and the model is paid for: without this rule anyone can
    // use it as a free general-purpose assistant.
    const instructions = buildInstructions("octocat");

    expect(instructions).toMatch(/unrelated/i);
    expect(instructions).toMatch(/decline/i);
  });

  it("tells the model its turn budget, so it batches tool calls instead of spending turns", () => {
    expect(buildInstructions("octocat")).toContain(`at most ${MAX_AGENT_STEPS} turns`);
  });

  it("answers a question about an unlisted project with 'private, cannot be shown', plus what the CV says", () => {
    // Observed: asked about pull requests to a company's private repos, the model
    // opened with "there is no PR to that organization" and only then added the
    // caveat, which reads as a denial. The owner's ask: say they are private, and
    // add what their CV says about that organization, nothing else.
    const instructions = buildInstructions("octocat");

    expect(instructions).toMatch(/private repositories cannot be shown/i);
    expect(instructions).toMatch(/what their CV says about that\s+organization/i);
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

  it("attributes CV and portfolio facts to their source instead of stating them as verified", () => {
    // The owner's ask: answers must come from GitHub or the CV, and read that way.
    expect(buildInstructions("octocat")).toMatch(/according to their CV/i);
  });

  it("trusts the GitHub tools over the CV for a repository's current state", () => {
    // The CV says Portfolio Agent has 137 tests; the repository has 220 by now.
    expect(buildInstructions("octocat")).toMatch(/GitHub tools win over the CV/i);
  });

  it("answers career questions from get_profile alone, without listing repositories", () => {
    expect(buildInstructions("octocat")).toMatch(/get_profile only/i);
  });

  it("reads skills and projects for a technology question, where the CV says it was used", () => {
    // Observed: asked "Does he have experience with AWS?", the model read only the
    // experience section and guessed where AWS was used; the AWS projects were in projects.
    expect(buildInstructions("octocat")).toMatch(/technology, ask for skills and projects in one call/i);
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

describe("MAX_OUTPUT_TOKENS", () => {
  it("leaves room for reasoning plus a concise answer, but not for an essay", () => {
    expect(MAX_OUTPUT_TOKENS).toBeGreaterThanOrEqual(2_048);
    expect(MAX_OUTPUT_TOKENS).toBeLessThanOrEqual(8_192);
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
