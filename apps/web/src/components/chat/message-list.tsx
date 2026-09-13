"use client";

import type { ChatStatus, UIMessage } from "ai";
import { useEffect, useRef } from "react";

import { EmptyState } from "./empty-state";
import { MessageBubble } from "./message-bubble";

interface MessageListProps {
  messages: UIMessage[];
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
    <ol className="flex flex-1 flex-col gap-4 overflow-y-auto px-1 py-6">
      {messages.map((message) => (
        <li key={message.id}>
          <MessageBubble message={message} />
        </li>
      ))}
      {status === "submitted" ? (
        <li className="px-4 text-sm text-zinc-500 dark:text-zinc-400">Thinking…</li>
      ) : null}
      <div ref={bottomRef} />
    </ol>
  );
}
