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

export function MessageList({ messages, owner, status, onSuggestion }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, status]);

  if (messages.length === 0) {
    return <EmptyState owner={owner} onPick={onSuggestion} />;
  }

  return (
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
      <div ref={bottomRef} />
    </ol>
  );
}

/** Placeholder answer while the first model step is still deciding what to do. */
function Working() {
  return (
    <div className="flex gap-3 sm:gap-4" role="status">
      <span aria-hidden className="w-6 shrink-0 pt-0.5 font-display text-2xl leading-none text-ink-faint italic">
        A.
      </span>
      <div className="flex-1 rounded-xl border border-rule bg-paper-raised px-4 py-4 sm:px-5">
        <p className="font-mono text-[12px] text-ink-soft">Choosing which tools to call…</p>
        <div aria-hidden className="mt-3 h-px overflow-hidden bg-rule">
          <div className="scan h-px w-1/3 bg-signal" />
        </div>
      </div>
    </div>
  );
}
