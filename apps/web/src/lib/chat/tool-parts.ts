import { type DynamicToolUIPart, type UIMessage, getToolName, isToolUIPart } from "ai";

type MessagePart = UIMessage["parts"][number];

/** Lifecycle states of a tool invocation, as defined by the AI SDK. */
export type ToolPartState = DynamicToolUIPart["state"];

export interface ToolPartView {
  name: string;
  state: ToolPartState;
  input: unknown;
  output: unknown;
  errorText: string | undefined;
}

/**
 * Normalizes the two shapes a tool invocation can take in a UI message:
 * `dynamic-tool` (tools discovered at runtime, e.g. from an MCP server) and
 * `tool-<name>` (tools known at compile time). Returns null for other parts.
 * Narrowing goes through the SDK's own guards, so a change in part shapes
 * fails to type-check here instead of failing silently at runtime.
 */
export function describeToolPart(part: MessagePart): ToolPartView | null {
  if (!isToolUIPart(part)) return null;

  return {
    name: getToolName(part),
    state: part.state,
    input: part.input,
    output: part.output,
    errorText: part.errorText,
  };
}
