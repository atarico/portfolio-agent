import type { Profile } from "../src/profile.ts";

/** A small profile for "octocat", with one entry per list. */
export const octocatProfile: Profile = {
  github: "octocat",
  name: "The Octocat",
  headline: "Mascot · 18 years of experience",
  location: "San Francisco, USA",
  availability: "Remote",
  summary: ["Keeps the octocat brand alive."],
  links: { github: "https://github.com/octocat", portfolio: "https://octocat.example.com" },
  contact: "Contact form on the portfolio.",
  experience: [
    {
      role: "Mascot",
      organization: "GitHub",
      period: "2008 – present",
      stack: ["Git"],
      highlights: ["Appeared on every 404 page."],
    },
  ],
  projects: [{ name: "Spoon-Knife", status: "Production", stack: ["HTML"], summary: "A repository to fork." }],
  skills: { Tools: ["Git"] },
  education: [{ title: "Git basics", institution: "GitHub Skills", status: "completed" }],
  certifications: ["GitHub Foundations"],
  languages: ["English"],
  sources: [{ name: "Portfolio site", url: "https://octocat.example.com", date: "2026-10-21" }],
};
