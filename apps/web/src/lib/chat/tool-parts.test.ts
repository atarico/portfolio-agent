import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";

import { describeToolPart, formatToolArgs } from "./tool-parts";

type Part = UIMessage["parts"][number];

describe("describeToolPart", () => {
  it("returns null for non-tool parts", () => {
    expect(describeToolPart({ type: "text", text: "hello" } as Part)).toBeNull();
    expect(describeToolPart({ type: "step-start" } as Part)).toBeNull();
  });

  it("describes a dynamic tool part (the shape MCP tools arrive in)", () => {
    const part = {
      type: "dynamic-tool",
      toolName: "list_repos",
      toolCallId: "call-1",
      state: "output-available",
      input: { limit: 5 },
      output: { total: 3 },
    } as Part;

    expect(describeToolPart(part)).toEqual({
      name: "list_repos",
      state: "output-available",
      input: { limit: 5 },
      output: { total: 3 },
      errorText: undefined,
    });
  });

  it("describes a statically typed tool part by stripping the prefix", () => {
    const part = {
      type: "tool-get_readme",
      toolCallId: "call-2",
      state: "input-available",
      input: { repo: "portfolio" },
    } as Part;

    expect(describeToolPart(part)).toMatchObject({ name: "get_readme", state: "input-available" });
  });

  it("surfaces the error text of a failed call", () => {
    const part = {
      type: "dynamic-tool",
      toolName: "detect_stack",
      toolCallId: "call-3",
      state: "output-error",
      input: {},
      errorText: "GitHub API 403",
    } as Part;

    expect(describeToolPart(part)).toMatchObject({ state: "output-error", errorText: "GitHub API 403" });
  });
});

describe("formatToolArgs", () => {
  it("prints a tool's input as a one-line argument list", () => {
    expect(formatToolArgs({ repo: "portfolio-agent", maxChars: 2000 })).toBe('repo: "portfolio-agent", maxChars: 2000');
  });

  it("prints nothing for a call without arguments", () => {
    expect(formatToolArgs({})).toBe("");
    expect(formatToolArgs(undefined)).toBe("");
  });

  it("shortens a long argument list so the trace stays on one line", () => {
    const text = formatToolArgs({ repo: "x".repeat(200) }, 20);

    expect(text).toHaveLength(20);
    expect(text.endsWith("…")).toBe(true);
  });
});
