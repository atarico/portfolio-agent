// @vitest-environment jsdom
import type { UIMessage } from "ai";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ChatMessage } from "@/lib/chat/metadata";

import { MessageBubble } from "./message-bubble";

afterEach(cleanup);

const message = (role: "user" | "assistant", text: string, metadata?: ChatMessage["metadata"]): ChatMessage =>
  ({ id: `${role}-1`, role, parts: [{ type: "text", text }], metadata }) as UIMessage as ChatMessage;

describe("MessageBubble", () => {
  it("renders assistant text as Markdown", () => {
    const { container } = render(<MessageBubble message={message("assistant", "See **portfolio-agent** now.")} />);

    expect(container.querySelector("strong")?.textContent).toBe("portfolio-agent");
    expect(container.textContent).not.toContain("**");
  });

  it("leaves the user's own text exactly as they typed it", () => {
    // A question *about* Markdown must read the way it was written. Reformatting
    // someone's own words back at them is the failure mode this pins.
    const { container } = render(<MessageBubble message={message("user", "what does **bold** mean?")} />);

    expect(container.querySelector("strong")).toBeNull();
    expect(container.textContent).toContain("what does **bold** mean?");
  });

  it("keeps the user's line breaks instead of collapsing them", () => {
    const { container } = render(<MessageBubble message={message("user", "first line\nsecond line")} />);

    const paragraph = container.querySelector("p");
    expect(paragraph?.className).toContain("whitespace-pre-wrap");
    expect(paragraph?.textContent).toBe("first line\nsecond line");
  });

  it("shows which model answered and how long it took under an assistant answer", () => {
    const { container } = render(
      <MessageBubble message={message("assistant", "Done.", { model: "gemini-3.6-flash", durationMs: 2_400 })} />,
    );

    expect(container.textContent).toContain("gemini-3.6-flash · 2.4 s");
  });

  it("names the model only once the answer has finished, not while it is still working", () => {
    // The model id arrives with each step; the duration only with the end of the answer.
    const { container } = render(<MessageBubble message={message("assistant", "Done.", { model: "gemini-3.6-flash" })} />);

    expect(container.querySelector("footer")).toBeNull();
  });

  it("shows no footer while the answer has no metadata yet", () => {
    const { container } = render(<MessageBubble message={message("assistant", "Done.")} />);

    expect(container.querySelector("footer")).toBeNull();
  });

  it("collects consecutive tool calls into one trace, in the order they were made", () => {
    const tool = (id: string, toolName: string) => ({
      type: "dynamic-tool",
      toolCallId: id,
      toolName,
      state: "output-available",
      input: { limit: 5 },
      output: {},
    });
    const answer = {
      id: "assistant-1",
      role: "assistant",
      parts: [tool("1", "list_repos"), tool("2", "detect_stack"), { type: "text", text: "Two repos." }],
    } as unknown as ChatMessage;

    const { container } = render(<MessageBubble message={answer} />);

    const traces = container.querySelectorAll("ol[aria-label]");
    expect(traces).toHaveLength(1);
    expect([...traces[0]!.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      expect.stringContaining("list_repos"),
      expect.stringContaining("detect_stack"),
    ]);
    expect(container.textContent).toContain("Two repos.");
  });
});
