// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Markdown } from "./markdown";

afterEach(cleanup);

describe("Markdown", () => {
  it("renders embedded HTML as literal text, never as markup", () => {
    // README text reaches this component by way of the model, so this is the
    // boundary that keeps a third-party README from becoming an injection
    // surface. It holds only because `rehype-raw` is absent; adding that plugin
    // is what this test exists to stop.
    const { container } = render(
      <Markdown>{'Look: <script>alert(1)</script> and <img src="x" onerror="alert(1)">'}</Markdown>,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<script>alert(1)</script>");
    expect(container.textContent).toContain('<img src="x" onerror="alert(1)">');
  });

  it("neutralises a javascript: link instead of rendering it as a working href", () => {
    // The href can come from the model or from a README it just read, so the
    // scheme is untrusted input. react-markdown strips dangerous schemes by
    // default; this pins that the component still relies on that default.
    const { container } = render(<Markdown>{"[click me](javascript:alert(1))"}</Markdown>);

    const link = container.querySelector("a");
    expect(link?.getAttribute("href") ?? "").not.toContain("javascript:");
  });

  it("renders a markdown link as an anchor that cannot reach window.opener", () => {
    render(<Markdown>{"See [portfolio-agent](https://github.com/atarico/portfolio-agent)."}</Markdown>);

    const link = screen.getByRole("link", { name: "portfolio-agent" });

    expect(link).toHaveProperty("href", "https://github.com/atarico/portfolio-agent");
    expect(link.getAttribute("target")).toBe("_blank");
    // Both tokens matter: noopener severs window.opener, noreferrer covers
    // browsers that only honour the latter.
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("rel")).toContain("noreferrer");
  });

  it("renders a numbered list of links as real list items, not as one run of text", () => {
    // This is the shape the agent actually answers in, and rendering it as a
    // paragraph of raw syntax is the bug this component was written to fix.
    const { container } = render(
      <Markdown>
        {[
          "Recent repositories:",
          "",
          "1. **[portfolio-agent](https://github.com/atarico/portfolio-agent)** (TypeScript)",
          "2. **[skills-inspector](https://github.com/atarico/skills-inspector)** (Python)",
        ].join("\n")}
      </Markdown>,
    );

    expect(container.querySelectorAll("ol > li")).toHaveLength(2);
    expect(container.querySelectorAll("a")).toHaveLength(2);
    expect(container.querySelector("strong")).not.toBeNull();
    // No leftover syntax anywhere in the rendered text.
    expect(container.textContent).not.toContain("**");
    expect(container.textContent).not.toContain("](");
  });
});
