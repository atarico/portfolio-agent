import type { UIMessage } from "ai";
import { z } from "zod";

/** Hard caps so one request cannot drain the LLM quota or the step budget. */
export const MAX_MESSAGES = 40;
export const MAX_PARTS_PER_MESSAGE = 20;
export const MAX_TEXT_CHARS = 4_000;

const textPart = z.object({ type: z.literal("text"), text: z.string().max(MAX_TEXT_CHARS) });

/** Any other UI part (tool calls, step markers...) must at least declare its type. */
const otherPart = z.looseObject({ type: z.string().min(1) }).refine((part) => part.type !== "text");

const messageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(["user", "assistant"]),
  parts: z.array(z.union([textPart, otherPart])).min(1).max(MAX_PARTS_PER_MESSAGE),
});

export const chatRequestSchema = z.object({
  messages: z
    .array(messageSchema)
    .min(1)
    .max(MAX_MESSAGES)
    .refine((messages) => messages.at(-1)?.role === "user", {
      message: "The last message must come from the user.",
    }),
});

export type ParsedChatRequest = { ok: true; messages: UIMessage[] } | { ok: false; issues: string[] };

/** Validates an untrusted request body. Never throws. */
export function parseChatRequest(body: unknown): ParsedChatRequest {
  const result = chatRequestSchema.safeParse(body);
  if (!result.success) {
    return { ok: false, issues: result.error.issues.map((issue) => issue.message) };
  }
  return { ok: true, messages: result.data.messages as UIMessage[] };
}
