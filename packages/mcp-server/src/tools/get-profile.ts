import type { Profile } from "../profile.ts";
import { ToolInputError } from "../validation.ts";

/** Parts of a profile a caller can ask for, so a question reads only what it needs. */
export const PROFILE_SECTIONS = ["overview", "experience", "projects", "skills", "education"] as const;

export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

type ProfileFacts = Omit<Profile, "github" | "name" | "sources">;

const SECTION_FIELDS: Record<ProfileSection, readonly (keyof ProfileFacts)[]> = {
  overview: ["headline", "location", "availability", "summary", "links", "contact", "languages"],
  experience: ["experience"],
  projects: ["projects"],
  skills: ["skills"],
  education: ["education", "certifications", "languages"],
};

export interface GetProfileInput {
  owner: string;
  /** Only these parts of the profile. Defaults to all of it. */
  sections?: readonly ProfileSection[];
}

export type GetProfileResult =
  | ({ owner: string; found: true; name: string; sources: Profile["sources"] } & Partial<ProfileFacts>)
  | { owner: string; found: false; message: string };

/**
 * Returns the owner's CV and portfolio facts, or some sections of them.
 *
 * The sources come with every answer, so the model can attribute what it says
 * ("according to their CV") instead of presenting it as verified fact.
 * A profile whose login is not the owner's is never served: one person's CV
 * must not be presented as another's when the server runs for someone else.
 */
export function getProfile(profile: Profile | undefined, { owner, sections = [] }: GetProfileInput): GetProfileResult {
  const unknown = sections.find((section) => !PROFILE_SECTIONS.includes(section));
  if (unknown !== undefined) {
    throw new ToolInputError(`Unknown profile section "${unknown}". Use one of: ${PROFILE_SECTIONS.join(", ")}.`);
  }
  if (!profile || profile.github.toLowerCase() !== owner.toLowerCase()) {
    return { owner, found: false, message: `No CV or portfolio data is published for ${owner}.` };
  }

  const { github: _github, name, sources, ...facts } = profile;
  const picked =
    sections.length > 0
      ? Object.fromEntries(sections.flatMap((section) => SECTION_FIELDS[section]).map((field) => [field, facts[field]]))
      : facts;
  return { owner, found: true, name, sources, ...picked };
}
