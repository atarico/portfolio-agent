import { describe, expect, it } from "vitest";

import { getProfile, type ProfileSection } from "../../src/tools/get-profile.ts";
import { ToolInputError } from "../../src/validation.ts";
import { octocatProfile } from "../fake-profile.ts";

describe("getProfile", () => {
  it("returns the whole profile with its sources when no sections are given", () => {
    const { github: _github, ...facts } = octocatProfile;

    expect(getProfile(octocatProfile, { owner: "octocat" })).toEqual({ owner: "octocat", found: true, ...facts });
  });

  it("returns only the requested sections, plus the name and the sources to attribute them to", () => {
    expect(getProfile(octocatProfile, { owner: "octocat", sections: ["experience"] })).toEqual({
      owner: "octocat",
      found: true,
      name: "The Octocat",
      sources: octocatProfile.sources,
      experience: octocatProfile.experience,
    });
  });

  it("combines several sections in one result, so one call answers a technology question", () => {
    expect(getProfile(octocatProfile, { owner: "octocat", sections: ["skills", "projects"] })).toEqual({
      owner: "octocat",
      found: true,
      name: "The Octocat",
      sources: octocatProfile.sources,
      skills: octocatProfile.skills,
      projects: octocatProfile.projects,
    });
  });

  it("groups the parts of each section", () => {
    const overview = getProfile(octocatProfile, { owner: "octocat", sections: ["overview"] });
    const education = getProfile(octocatProfile, { owner: "octocat", sections: ["education"] });

    expect(Object.keys(overview).sort()).toEqual(
      ["availability", "contact", "found", "headline", "languages", "links", "location", "name", "owner", "sources", "summary"],
    );
    expect(education).toMatchObject({
      education: octocatProfile.education,
      certifications: octocatProfile.certifications,
      languages: octocatProfile.languages,
    });
  });

  it("matches the owner case-insensitively, as GitHub logins do", () => {
    expect(getProfile(octocatProfile, { owner: "OctoCat", sections: ["skills"] })).toMatchObject({ found: true });
  });

  it("never presents one person's profile as another's", () => {
    expect(getProfile(octocatProfile, { owner: "mallory" })).toEqual({
      owner: "mallory",
      found: false,
      message: "No CV or portfolio data is published for mallory.",
    });
  });

  it("reports that there is no profile when none is configured", () => {
    expect(getProfile(undefined, { owner: "octocat" })).toMatchObject({ found: false });
  });

  it("rejects an unknown section", () => {
    expect(() =>
      getProfile(octocatProfile, { owner: "octocat", sections: ["skills", "salary" as ProfileSection] }),
    ).toThrow(ToolInputError);
  });
});
