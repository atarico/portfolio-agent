import type { TextStreamPart, ToolSet, UIMessage } from "ai";

/**
 * What the server attaches to each answer, so the reader can see which model
 * of the fallback chain served it and how long the whole answer took.
 */
export interface AnswerMetadata {
  /** Model id as the provider reported it for the last step. */
  model?: string;
  durationMs?: number;
}

export type ChatMessage = UIMessage<AnswerMetadata>;

/**
 * Maps one stream part to the metadata it contributes. The client merges
 * successive values, so the model arrives with each step and the duration
 * with the end of the answer.
 */
export function answerMetadata(
  part: TextStreamPart<ToolSet>,
  startedAt: number,
  now: () => number = Date.now,
): AnswerMetadata | undefined {
  if (part.type === "finish-step") return { model: part.response.modelId };
  if (part.type === "finish") return { durationMs: now() - startedAt };
  return undefined;
}

/** The UI copy is English, so durations are formatted for English too. */
const SECONDS = new Intl.NumberFormat("en", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * "gemini-3.6-flash · 2.4 s", or whichever half is known; `null` when neither is.
 * The space before the unit is non-breaking, so "s" never wraps away from its number.
 */
export function formatAnswerMetadata(metadata: AnswerMetadata | undefined): string | null {
  const parts: string[] = [];
  if (metadata?.model) parts.push(metadata.model);
  if (metadata?.durationMs !== undefined) parts.push(`${SECONDS.format(metadata.durationMs / 1000)}\u00a0s`);
  return parts.length > 0 ? parts.join(" · ") : null;
}
