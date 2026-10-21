import type { TextStreamPart, ToolSet } from "ai";
import { describe, expect, it } from "vitest";

import { answerMetadata, formatAnswerMetadata } from "./metadata";

const part = (value: object) => value as TextStreamPart<ToolSet>;

describe("answerMetadata", () => {
  it("names the model that served each step, as the provider reported it", () => {
    expect(answerMetadata(part({ type: "finish-step", response: { modelId: "gemini-3.6-flash" } }), 0, () => 0)).toEqual(
      { model: "gemini-3.6-flash" },
    );
  });

  it("measures the whole answer when it finishes", () => {
    expect(answerMetadata(part({ type: "finish" }), 1_000, () => 3_450)).toEqual({ durationMs: 2_450 });
  });

  it("adds nothing for any other part", () => {
    expect(answerMetadata(part({ type: "text-delta", id: "t", text: "hi" }), 0, () => 0)).toBeUndefined();
  });
});

describe("formatAnswerMetadata", () => {
  it("reads as model and seconds", () => {
    expect(formatAnswerMetadata({ model: "openai/gpt-oss-120b", durationMs: 2_450 })).toBe(
      "openai/gpt-oss-120b · 2.5 s",
    );
  });

  it("shows whatever part is known, and nothing when neither is", () => {
    expect(formatAnswerMetadata({ model: "gemini-3.6-flash" })).toBe("gemini-3.6-flash");
    expect(formatAnswerMetadata({ durationMs: 900 })).toBe("0.9 s");
    expect(formatAnswerMetadata(undefined)).toBeNull();
  });
});
