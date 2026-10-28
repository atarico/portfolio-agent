import type { ReactNode } from "react";

import { formatAnswerMetadata, type ChatMessage } from "@/lib/chat/metadata";
import { describeToolPart, type ToolPartView } from "@/lib/chat/tool-parts";

import { Markdown } from "./markdown";
import { ToolCallBadge } from "./tool-call-badge";

interface MessageBubbleProps {
  message: ChatMessage;
}

/**
 * The conversation reads like a terminal session: the visitor's question as a
 * command at a `$` prompt, the agent's answer as its output, with the tool trace.
 */
export function MessageBubble({ message }: MessageBubbleProps) {
  return message.role === "user" ? <Question message={message} /> : <Answer message={message} />;
}

function Question({ message }: MessageBubbleProps) {
  return (
    <div className="flex gap-3 sm:gap-4">
      <Marker className="glow text-signal">$</Marker>
      <div className="flex min-w-0 flex-col gap-2">
        <span className="sr-only">You asked:</span>
        {message.parts.map((part, index) =>
          // The user's text stays literal: it is what they typed, and reformatting
          // their own words back at them would be wrong - a message about `**bold**`
          // should read as they wrote it.
          part.type === "text" ? (
            <p
              key={`${message.id}-${index}`}
              className="whitespace-pre-wrap break-words text-[18px] leading-snug font-bold tracking-[-0.01em] sm:text-[20px]"
            >
              {part.text}
            </p>
          ) : null,
        )}
      </div>
    </div>
  );
}

function Answer({ message }: MessageBubbleProps) {
  // The model arrives with every step but the duration only at the end, so the
  // footer waits for the duration: naming a model mid-answer reads as finished.
  const servedBy = message.metadata?.durationMs === undefined ? null : formatAnswerMetadata(message.metadata);

  return (
    <div className="flex gap-3 sm:gap-4">
      <Marker className="text-ink-faint">&gt;</Marker>
      <div className="flex min-w-0 flex-1 flex-col gap-4 rounded-lg border border-rule bg-paper-raised px-4 py-4 sm:px-5">
        <span className="sr-only">Answer:</span>
        {toBlocks(message).map((block) =>
          block.kind === "text" ? (
            <Markdown key={block.key}>{block.text}</Markdown>
          ) : (
            <ol key={block.key} aria-label="Tools the agent called" className="flex flex-col border-l border-rule pl-3">
              {block.tools.map((tool, index) => (
                <li key={`${block.key}-${index}`}>
                  <ToolCallBadge tool={tool} />
                </li>
              ))}
            </ol>
          ),
        )}
        {servedBy ? (
          <footer className="flex items-center gap-2 border-t border-dashed border-rule pt-3 font-mono text-[11px] text-ink-faint">
            <span aria-hidden className="size-1.5 rounded-full bg-ok shadow-[var(--glow-sm)]" />
            <span className="uppercase tracking-[0.14em]">answered by</span>
            <span className="text-ink-soft" translate="no">
              {servedBy}
            </span>
          </footer>
        ) : null}
      </div>
    </div>
  );
}

function Marker({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span aria-hidden className={`w-5 shrink-0 pt-0.5 text-[18px] leading-snug font-bold sm:text-[20px] ${className}`}>
      {children}
    </span>
  );
}

type Block = { kind: "text"; key: string; text: string } | { kind: "tools"; key: string; tools: ToolPartView[] };

/**
 * Splits an answer into what it said and what it did. Consecutive tool calls
 * form one trace, so a step that called four tools reads as one block of work
 * rather than four interruptions; the order of everything is kept.
 */
function toBlocks(message: ChatMessage): Block[] {
  const blocks: Block[] = [];
  message.parts.forEach((part, index) => {
    const key = `${message.id}-${index}`;
    if (part.type === "text") {
      if (part.text) blocks.push({ kind: "text", key, text: part.text });
      return;
    }
    const tool = describeToolPart(part);
    if (!tool) return;
    const last = blocks.at(-1);
    if (last?.kind === "tools") last.tools.push(tool);
    else blocks.push({ kind: "tools", key, tools: [tool] });
  });
  return blocks;
}
