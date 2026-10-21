// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatInput } from "./chat-input";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function pointer(fine: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(pointer: fine)" && fine }));
}

const props = { value: "", onChange: () => {}, onSubmit: () => {}, onStop: () => {} };

describe("ChatInput", () => {
  it("keeps the box usable while the agent works, so focus stays and the next question can be typed", () => {
    pointer(true);
    render(<ChatInput {...props} busy />);

    expect(screen.getByRole("textbox", { name: "Ask the portfolio agent" })).toHaveProperty("disabled", false);
  });

  it("names the submit button without reading its keyboard glyph aloud", () => {
    pointer(true);
    render(<ChatInput {...props} value="hi" busy={false} />);

    expect(screen.getByRole("button", { name: "Ask" })).toBeTruthy();
  });

  it("gives the field a name and keeps browser autofill out of it", () => {
    pointer(true);
    render(<ChatInput {...props} busy={false} />);

    const input = screen.getByRole("textbox");
    expect(input.getAttribute("name")).toBe("question");
    expect(input.getAttribute("autocomplete")).toBe("off");
  });

  it("focuses the box on load with a mouse, but not on a touch screen where it would open the keyboard", () => {
    pointer(false);
    const { unmount } = render(<ChatInput {...props} busy={false} />);
    expect(document.activeElement).not.toBe(screen.getByRole("textbox"));
    unmount();

    pointer(true);
    render(<ChatInput {...props} busy={false} />);
    expect(document.activeElement).toBe(screen.getByRole("textbox"));
  });
});
