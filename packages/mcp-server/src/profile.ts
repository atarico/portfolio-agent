import profileData from "./data/profile.json" with { type: "json" };

/**
 * What the owner's CV and portfolio site say about them, converted once into
 * data the agent can read in one tool call: no PDF parsing or page fetch at
 * question time. Text is copied from the sources in their own language, so an
 * answer quotes the owner's documents rather than a rewording of them.
 */
export interface Profile {
  /** GitHub login this profile belongs to. It is only served for that owner. */
  github: string;
  name: string;
  headline: string;
  location: string;
  availability: string;
  summary: string[];
  links: Record<string, string>;
  /** Where to get in touch. Email and phone stay on the portfolio site, out of this repository. */
  contact: string;
  experience: ProfileExperience[];
  projects: ProfileProject[];
  /** Skill names grouped by category. */
  skills: Record<string, string[]>;
  education: ProfileEducation[];
  certifications: string[];
  languages: string[];
  sources: ProfileSource[];
}

export interface ProfileExperience {
  role: string;
  organization: string;
  location?: string;
  period: string;
  description?: string;
  stack: string[];
  highlights: string[];
}

export interface ProfileProject {
  name: string;
  tagline?: string;
  status?: string;
  url?: string;
  demo?: string;
  stack: string[];
  summary?: string;
  highlights?: string[];
}

export interface ProfileEducation {
  title: string;
  institution: string;
  status: string;
}

export interface ProfileSource {
  name: string;
  url?: string;
  /** Date of the version that was converted (file date of a document, fetch date of a page), as YYYY-MM-DD. */
  date: string;
}

/**
 * The profile if it belongs to `owner`, matched case-insensitively as GitHub
 * logins are. One person's CV must never be presented as another's when the
 * server runs for someone else.
 */
export function ownedProfile(profile: Profile | undefined, owner: string): Profile | undefined {
  return profile?.github.toLowerCase() === owner.toLowerCase() ? profile : undefined;
}

/**
 * The default owner's profile, from their two CVs and their portfolio site.
 * To update it, edit src/data/profile.json; the type check rejects a field
 * with the wrong shape, and test/profile.test.ts keeps contact data out.
 */
export const DEFAULT_PROFILE: Profile = profileData;
