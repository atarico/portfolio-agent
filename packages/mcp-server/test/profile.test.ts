import { describe, expect, it } from "vitest";

import { DEFAULT_OWNER } from "../src/owner.ts";
import { DEFAULT_PROFILE } from "../src/profile.ts";

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;

/** Runs of digits, spaces and hyphens with at least 10 digits: phone numbers, but not dates. */
const phoneNumbers = (text: string) =>
  (text.match(/\+?\d[\d\s-]*\d/g) ?? []).filter((run) => run.replace(/\D/g, "").length >= 10);

describe("DEFAULT_PROFILE", () => {
  it("belongs to the default owner", () => {
    expect(DEFAULT_PROFILE.github).toBe(DEFAULT_OWNER);
  });

  it("holds no email address or phone number: contact goes through the portfolio site", () => {
    const text = JSON.stringify(DEFAULT_PROFILE);

    expect(phoneNumbers("WhatsApp +54 11 5555-0100, updated 2026-10-21")).toEqual(["+54 11 5555-0100"]);
    expect(text).not.toMatch(EMAIL);
    expect(phoneNumbers(text)).toEqual([]);
  });

  it("links only over https", () => {
    const urls = [
      ...Object.values(DEFAULT_PROFILE.links),
      ...DEFAULT_PROFILE.projects.flatMap((project) => [project.url, project.demo]),
      ...DEFAULT_PROFILE.sources.map((source) => source.url),
    ].filter((url) => url !== undefined);

    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(new URL(url).protocol, url).toBe("https:");
  });

  it("names a source and a date for every fact it holds", () => {
    expect(DEFAULT_PROFILE.sources.length).toBeGreaterThan(0);
    for (const source of DEFAULT_PROFILE.sources) expect(source.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
