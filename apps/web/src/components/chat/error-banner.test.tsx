// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ErrorBanner } from "./error-banner";

afterEach(cleanup);

describe("ErrorBanner", () => {
  it("announces itself to assistive technology rather than appearing silently", () => {
    // An error a screen reader never hears is an error that did not happen for
    // the person who most needs to know the request failed.
    render(<ErrorBanner message="Something failed." onDismiss={() => {}} />);

    expect(screen.getByRole("alert").textContent).toContain("Something failed.");
  });

  it("dismisses through the button", () => {
    const onDismiss = vi.fn();
    render(<ErrorBanner message="Something failed." onDismiss={onDismiss} />);

    screen.getByRole("button", { name: "Dismiss" }).click();

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("wraps a long unbroken message instead of stretching the layout", () => {
    // Error text is not authored for the page; it arrives from the server and can
    // be one long token, so the paragraph has to be allowed to break inside words.
    const { container } = render(<ErrorBanner message={"x".repeat(400)} onDismiss={() => {}} />);

    expect(container.querySelector("p")?.className).toContain("break-words");
  });
});
