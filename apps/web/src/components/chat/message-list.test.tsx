// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatMessage } from "@/lib/chat/metadata";

import { MessageList, isNearBottom } from "./message-list";

beforeEach(() => {
  // jsdom does not lay out, so it has no scrolling to perform.
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

const question = { id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] } as ChatMessage;
const answer = { id: "a1", role: "assistant", parts: [{ type: "text", text: "Hello." }] } as ChatMessage;

describe("isNearBottom", () => {
  it("follows the conversation only while the reader is at its end", () => {
    expect(isNearBottom(1_000, 1_050)).toBe(true);
    expect(isNearBottom(400, 1_050)).toBe(false);
  });
});

describe("MessageList", () => {
  it("keeps the list valid: nothing but list items inside it", () => {
    const { container } = render(<MessageList messages={[question]} owner="octocat" status="submitted" onSuggestion={() => {}} />);

    expect(container.querySelectorAll("ol > :not(li)")).toHaveLength(0);
  });

  it("tells screen readers when an answer is ready, not on every streamed word", () => {
    const { rerender } = render(
      <MessageList messages={[question, answer]} owner="octocat" status="streaming" onSuggestion={() => {}} />,
    );
    expect(screen.getByRole("status").textContent).toBe("");

    rerender(<MessageList messages={[question, answer]} owner="octocat" status="ready" onSuggestion={() => {}} />);
    expect(screen.getByRole("status").textContent).toBe("Answer ready.");
  });
});
