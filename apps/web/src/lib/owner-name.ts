import { DEFAULT_PROFILE, ownedProfile } from "@portfolio-agent/mcp-server";

/**
 * The name the page greets with: the one on the owner's CV, or their GitHub
 * login when the bundled CV belongs to someone else (`ownedProfile` is the same
 * rule that keeps get_profile from serving one person's CV as another's).
 */
export function ownerDisplayName(owner: string): string {
  return ownedProfile(DEFAULT_PROFILE, owner)?.name ?? owner;
}
