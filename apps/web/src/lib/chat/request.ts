import type { UIMessage } from "ai";
import { z } from "zod";

/**
 * Hard caps so one request cannot drain the LLM quota or the step budget.
 *
 * The part and text caps apply to user messages, what a visitor types. The
 * assistant's own earlier answers come back as history, and a long answer (a
 * whole CV) or a many-step one would otherwise block every question after it;
 * MAX_PAYLOAD_BYTES bounds those instead.
 */
export const MAX_MESSAGES = 40;
export const MAX_PARTS_PER_MESSAGE = 20;
export const MAX_TEXT_CHARS = 4_000;

/**
 * Aggregate budget over the whole serialized `messages` payload, in bytes.
 *
 * This replaces the idea of a per-part size ceiling for non-text parts (tool
 * calls, step markers, ...): those parts are structurally unbounded (`otherPart`
 * below is a `looseObject`, so it accepts arbitrary extra fields), and an
 * assistant message may carry any number of them. A per-part cap only bounds
 * one part while hundreds of them can still arrive; an aggregate cap bounds the
 * whole request regardless of how the size is distributed across parts.
 */
export const MAX_PAYLOAD_BYTES = 131_072; // 128 KiB

const textPart = z.object({ type: z.literal("text"), text: z.string().max(MAX_TEXT_CHARS) });

/**
 * Any other UI part (tool calls, step markers...) must at least declare its type.
 *
 * The `type !== "text"` refinement is load-bearing, not defensive: this schema
 * never inspects a `text` field, so without it an oversized text part would
 * fail `textPart`'s MAX_TEXT_CHARS check, fall through to this branch of the
 * union, and be admitted with its length cap silently bypassed.
 */
const otherPart = z.looseObject({ type: z.string().min(1) }).refine((part) => part.type !== "text");

const userMessageSchema = z.object({
  id: z.string().optional(),
  role: z.literal("user"),
  parts: z.array(z.union([textPart, otherPart])).min(1).max(MAX_PARTS_PER_MESSAGE),
});

/** An earlier answer: its text and parts come from the model, so only MAX_PAYLOAD_BYTES bounds them. */
const answerTextPart = z.object({ type: z.literal("text"), text: z.string() });

const assistantMessageSchema = z.object({
  id: z.string().optional(),
  role: z.literal("assistant"),
  parts: z.array(z.union([answerTextPart, otherPart])).min(1),
});

// The role is checked on its own first, so an unknown role keeps the error it
// always had; only then does it pick the caps that message gets.
const messageSchema = z
  .looseObject({ role: z.enum(["user", "assistant"]) })
  .pipe(z.discriminatedUnion("role", [userMessageSchema, assistantMessageSchema]));

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
