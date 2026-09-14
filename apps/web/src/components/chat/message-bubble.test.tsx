// @vitest-environment jsdom
import type { UIMessage } from "ai";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MessageBubble } from "./message-bubble";

afterEach(cleanup);

const message = (role: "user" | "assistant", text: string): UIMessage =>
  ({ id: `${role}-1`, role, parts: [{ type: "text", text }] }) as UIMessage;

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
});
