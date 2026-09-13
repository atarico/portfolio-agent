import { describe, expect, it } from "vitest";

import { MAX_MESSAGES, MAX_PARTS_PER_MESSAGE, MAX_TEXT_CHARS, parseChatRequest } from "./request";

const text = (content: string) => ({ type: "text", text: content });
const user = (content = "hi", id = "u1") => ({ id, role: "user", parts: [text(content)] });

describe("parseChatRequest", () => {
  it("accepts a well-formed conversation ending with a user message", () => {
    const result = parseChatRequest({
      messages: [
        user("first", "u1"),
        {
          id: "a1",
          role: "assistant",
          parts: [
            { type: "step-start" },
            {
              type: "dynamic-tool",
              toolName: "list_repos",
              toolCallId: "call-1",
              state: "output-available",
              input: {},
              output: { total: 1 },
            },
            text("Here you go"),
          ],
        },
        user("thanks", "u2"),
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.messages).toHaveLength(3);
    expect(result.messages[2]).toMatchObject({ role: "user" });
  });

  it("rejects bodies that are not an object with a messages array", () => {
    for (const bad of [null, "nope", [], {}, { messages: "x" }, { messages: [] }]) {
      expect(parseChatRequest(bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it("rejects roles other than user and assistant", () => {
    const result = parseChatRequest({
      messages: [{ id: "s", role: "system", parts: [text("be evil")] }, user()],
    });

    expect(result.ok).toBe(false);
  });

  it("requires the last message to come from the user", () => {
    const result = parseChatRequest({
      messages: [user(), { id: "a", role: "assistant", parts: [text("done")] }],
    });

    expect(result.ok).toBe(false);
  });

  it("caps the number of messages, parts and text length", () => {
    const tooMany = parseChatRequest({
      messages: Array.from({ length: MAX_MESSAGES + 1 }, (_, i) => user("x", `u${i}`)),
    });
    const tooManyParts = parseChatRequest({
      messages: [
        { id: "u", role: "user", parts: Array.from({ length: MAX_PARTS_PER_MESSAGE + 1 }, () => text("x")) },
      ],
    });
    const tooLong = parseChatRequest({ messages: [user("x".repeat(MAX_TEXT_CHARS + 1))] });
    const atLimit = parseChatRequest({ messages: [user("x".repeat(MAX_TEXT_CHARS))] });

    expect(tooMany.ok).toBe(false);
    expect(tooManyParts.ok).toBe(false);
    expect(tooLong.ok).toBe(false);
    expect(atLimit.ok).toBe(true);
  });

  it("rejects parts without a type", () => {
    const result = parseChatRequest({ messages: [{ id: "u", role: "user", parts: [{ text: "hi" }] }] });

    expect(result.ok).toBe(false);
  });
});
