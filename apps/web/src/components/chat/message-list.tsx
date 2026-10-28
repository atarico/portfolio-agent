"use client";

import type { ChatStatus } from "ai";
import { useEffect, useRef } from "react";

import type { ChatMessage } from "@/lib/chat/metadata";

import { EmptyState } from "./empty-state";
import { MessageBubble } from "./message-bubble";

interface MessageListProps {
  messages: ChatMessage[];
  owner: string;
  status: ChatStatus;
  onSuggestion: (text: string) => void;
}

/** How close to the end, in px, still counts as "reading the latest answer". */
const FOLLOW_THRESHOLD_PX = 96;

/** Whether the reader is at the end of the page (and so wants new text followed). */
export function isNearBottom(viewportBottom: number, contentHeight: number, threshold = FOLLOW_THRESHOLD_PX): boolean {
  return contentHeight - viewportBottom <= threshold;
}

export function MessageList({ messages, owner, status, onSuggestion }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const lastRole = messages.at(-1)?.role;

  // Follow the answer as it streams only while the reader is at the end: someone
  // who scrolled up to read an earlier part must not be dragged down on every word.
  useEffect(() => {
    const onScroll = () => {
      follow.current = isNearBottom(window.scrollY + window.innerHeight, document.documentElement.scrollHeight);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // A question just sent is always shown: asking is the clearest sign of wanting the end.
  useEffect(() => {
    if (lastRole === "user") follow.current = true;
  }, [messages.length, lastRole]);

  useEffect(() => {
    if (follow.current) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, status]);

  if (messages.length === 0) {
    return <EmptyState owner={owner} onPick={onSuggestion} />;
  }

  const answerReady = status === "ready" && lastRole === "assistant";

  return (
    <div className="flex flex-1 flex-col">
      <ol className="flex flex-1 flex-col gap-8 py-8">
        {messages.map((message) => (
          <li key={message.id} className="rise">
            <MessageBubble message={message} />
          </li>
        ))}
        {status === "submitted" ? (
          <li className="rise">
            <Working />
          </li>
        ) : null}
      </ol>
      {/* Announced once when an answer completes; the streamed words themselves are
          not a live region, or a screen reader would read every token as it lands. */}
      <p role="status" className="sr-only">
        {answerReady ? "Answer ready." : ""}
      </p>
      <div ref={bottomRef} />
    </div>
  );
}

/** Placeholder answer while the first model step is still deciding what to do. */
function Working() {
  return (
    <div className="flex gap-3 sm:gap-4" role="status" aria-label="Working on the answer">
      <span aria-hidden className="w-5 shrink-0 pt-0.5 text-[18px] leading-snug font-bold text-ink-faint sm:text-[20px]">
        &gt;
      </span>
      <div className="flex-1 rounded-lg border border-rule bg-paper-raised px-4 py-4 sm:px-5">
        <p className="font-mono text-[12px] text-ink-soft">
          Choosing which tools to call…
          <span aria-hidden className="cursor-blink ml-1 font-bold text-signal">
            _
          </span>
        </p>
        <div aria-hidden className="mt-3 h-px overflow-hidden bg-rule">
          <div className="scan h-px w-1/3 bg-signal" />
        </div>
      </div>
    </div>
  );
}
