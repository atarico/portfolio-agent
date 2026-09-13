import type { UIMessage } from "ai";
import { z } from "zod";

/** Hard caps so one request cannot drain the LLM quota or the step budget. */
export const MAX_MESSAGES = 40;
export const MAX_PARTS_PER_MESSAGE = 20;
export const MAX_TEXT_CHARS = 4_000;

/**
 * Aggregate budget over the whole serialized `messages` payload, in bytes.
 *
 * This replaces the idea of a per-part size ceiling for non-text parts (tool
 * calls, step markers, ...): those parts are structurally unbounded (`otherPart`
 * below is a `looseObject`, so it accepts arbitrary extra fields), and up to
 * MAX_MESSAGES * MAX_PARTS_PER_MESSAGE = 40 * 20 = 800 of them can appear in one
 * request. A per-part cap only bounds one part while the message and part caps
 * still permit hundreds of them; an aggregate cap bounds the whole request
 * regardless of how the size is distributed across parts.
 */
export const MAX_PAYLOAD_BYTES = 131_072; // 128 KiB

const textPart = z.object({ type: z.literal("text"), text: z.string().max(MAX_TEXT_CHARS) });

/** Any other UI part (tool calls, step markers...) must at least declare its type. */
const otherPart = z.looseObject({ type: z.string().min(1) }).refine((part) => part.type !== "text");

const messageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(["user", "assistant"]),
  parts: z.array(z.union([textPart, otherPart])).min(1).max(MAX_PARTS_PER_MESSAGE),
});

/** Byte size of a value's JSON serialization, measured in actual bytes (not JS string length). */
function jsonByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

export const chatRequestSchema = z.object({
  messages: z
    .array(messageSchema)
    .min(1)
    .max(MAX_MESSAGES)
    .refine((messages) => messages.at(-1)?.role === "user", {
      message: "The last message must come from the user.",
    })
    .refine((messages) => jsonByteLength(messages) <= MAX_PAYLOAD_BYTES, {
      message: `The messages payload exceeds the aggregate budget of ${MAX_PAYLOAD_BYTES} bytes.`,
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
