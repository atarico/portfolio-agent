import { validateOwner } from "./validation.ts";

/** Portfolio owner used when the environment does not provide one. */
export const DEFAULT_OWNER = "atarico";

type Env = Record<string, string | undefined>;

/**
 * Single source of truth for "whose portfolio is this": every entry point
 * (HTTP route, chat agent, stdio server, page header) resolves the owner here.
 * The owner is server configuration, never caller input.
 */
export function resolveOwner(env: Env = process.env): string {
  const configured = env.GITHUB_OWNER?.trim();
  if (!configured) return DEFAULT_OWNER;

  try {
    return validateOwner(configured);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`GITHUB_OWNER is not a valid GitHub login: ${reason}`);
  }
}
