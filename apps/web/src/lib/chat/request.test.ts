import { describe, expect, it } from "vitest";

import { MAX_MESSAGES, MAX_PARTS_PER_MESSAGE, MAX_PAYLOAD_BYTES, MAX_TEXT_CHARS, parseChatRequest } from "./request";

const text = (content: string) => ({ type: "text", text: content });
const user = (content = "hi", id = "u1") => ({ id, role: "user", parts: [text(content)] });

/** A non-text part with an arbitrary payload field, sized so its serialized JSON is `bytes` long. */
const otherPartOfSize = (bytes: number, fill = "a") => ({ type: "note", pad: fill.repeat(Math.max(0, bytes)) });

const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

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

  it("rejects many small non-text parts that individually pass every cap but together blow the aggregate payload budget", () => {
    // Each part here is tiny (well under any per-part concern) and every message respects
    // MAX_PARTS_PER_MESSAGE, so only an aggregate byte budget over the whole payload can catch this.
    const assistantWithParts = (id: string) => ({
      id,
      role: "assistant",
      parts: Array.from({ length: MAX_PARTS_PER_MESSAGE }, () => otherPartOfSize(150)),
    });
    const messages = [
      ...Array.from({ length: MAX_MESSAGES - 1 }, (_, i) => assistantWithParts(`a${i}`)),
      user("done"),
    ];

    // Sanity check: this payload is built from parts and messages that are each individually
    // within their own caps, so only the aggregate budget can be the reason for rejection.
    expect(byteLength(messages)).toBeGreaterThan(MAX_PAYLOAD_BYTES);

    const result = parseChatRequest({ messages });

    expect(result.ok).toBe(false);
  });

  it("accepts a payload exactly at the aggregate payload budget and rejects one byte over", () => {
    const buildAtBytes = (targetBytes: number) => {
      const messages = [{ id: "a", role: "assistant", parts: [otherPartOfSize(0)] }, user("hi", "u")];
      const bytesWithEmptyPad = byteLength(messages);
      const padLength = targetBytes - bytesWithEmptyPad;
      (messages[0].parts[0] as { pad: string }).pad = "a".repeat(padLength);
      return messages;
    };

    const atBudget = buildAtBytes(MAX_PAYLOAD_BYTES);
    const overBudget = buildAtBytes(MAX_PAYLOAD_BYTES + 1);

    expect(byteLength(atBudget)).toBe(MAX_PAYLOAD_BYTES);
    expect(byteLength(overBudget)).toBe(MAX_PAYLOAD_BYTES + 1);

    expect(parseChatRequest({ messages: atBudget }).ok).toBe(true);
    expect(parseChatRequest({ messages: overBudget }).ok).toBe(false);
  });

  it("counts multi-byte characters by their UTF-8 byte size, not by character count", () => {
    // "€" is one JS string character (one UTF-16 code unit) but 3 bytes in UTF-8.
    const charCount = 50_000;
    const asciiMessages = [{ id: "a", role: "assistant", parts: [otherPartOfSize(charCount, "a")] }, user()];
    const multiByteMessages = [{ id: "a", role: "assistant", parts: [otherPartOfSize(charCount, "€")] }, user()];

    // Same number of characters in the payload, wildly different byte sizes.
    expect(byteLength(asciiMessages)).toBeLessThan(MAX_PAYLOAD_BYTES);
    expect(byteLength(multiByteMessages)).toBeGreaterThan(MAX_PAYLOAD_BYTES);

    expect(parseChatRequest({ messages: asciiMessages }).ok).toBe(true);
    expect(parseChatRequest({ messages: multiByteMessages }).ok).toBe(false);
  });
});
