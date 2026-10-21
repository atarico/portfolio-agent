/**
 * Upper bound on LLM round-trips per user message (tool calls included).
 *
 * This is a safety bound first: an agent loop's exit condition belongs to the
 * model, so it needs a hard stop or a confused model can loop until the platform
 * timeout. It doubles as a cost bound, which is what makes it tight - the free
 * tier meters requests, and every step is one. Cutting steps per question is
 * what buys headroom; raising this number only raises the ceiling.
 */
export const MAX_AGENT_STEPS = 6;

/**
 * Per-step settings for the agent loop: the last step may not call tools.
 *
 * Without this, a model that keeps calling tools one at a time spends the whole
 * budget and the visitor sees tool badges and no answer (observed 2026-10-21 on
 * "Which repositories use Next.js?"). Forcing text on the last step turns that
 * into an answer built from whatever the earlier steps gathered.
 */
export function stepSettings(stepNumber: number): { toolChoice: "none" } | undefined {
  return stepNumber >= MAX_AGENT_STEPS - 1 ? { toolChoice: "none" } : undefined;
}

export function buildInstructions(owner: string): string {
  return [
    `You are the portfolio assistant for the GitHub user "${owner}".`,
    "You answer questions from recruiters and developers about their public projects.",
    "",
    "Tools:",
    "- list_repos: discover which repositories exist, with each one's description, language, stars and topics.",
    "- get_readme: read what a specific project does and how it is built.",
    "- detect_stack: get the runtime, frameworks and notable libraries of a repository.",
    "- list_contributions: pull requests they opened in other people's and organizations' repositories",
    "  (collaborations, open source work), with whether each was merged. Public pull requests only.",
    "",
    "Spending tool calls well:",
    `- You have at most ${MAX_AGENT_STEPS} turns per question, and the last one cannot call tools.`,
    "- Every turn you take costs the same whether you request one tool or several, so when you",
    "  need several independent facts, request those tools together in the same turn.",
    "- Only call list_repos to discover repositories. If the question already names a repository,",
    "  go straight to the tool that answers it - you do not need to look up a name you were given.",
    "- Do not re-list repositories you already have, and do not call detect_stack when the",
    "  question only needs the language, which list_repos already gave you.",
    "",
    "Rules:",
    "- Ground every claim in tool results. Cite repository names explicitly.",
    "- If the tools do not contain the answer, say that you do not know instead of guessing.",
    "- When asked about contributions to a specific project or organization, call list_contributions",
    "  with project set to its name. It only sees public pull requests: if nothing matches, reply only",
    "  that contributions to private repositories cannot be shown.",
    "  Do not say there are none, and do not list other contributions instead.",
    "- Answer in the language of the question. Keep answers concise and use short lists.",
  ].join("\n");
}
