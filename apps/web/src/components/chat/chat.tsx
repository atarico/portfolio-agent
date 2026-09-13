"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useMemo, useState } from "react";

import { ChatInput } from "./chat-input";
import { ErrorBanner } from "./error-banner";
import { MessageList } from "./message-list";

interface ChatProps {
  owner: string;
}

/** Container: owns chat state and wiring; rendering is delegated to presentational parts. */
export function Chat({ owner }: ChatProps) {
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);
  const { messages, sendMessage, status, error, stop, clearError } = useChat({ transport });
  const [input, setInput] = useState("");

  const busy = status === "submitted" || status === "streaming";

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    void sendMessage({ text: trimmed });
    setInput("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MessageList messages={messages} owner={owner} status={status} onSuggestion={submit} />
      {error ? <ErrorBanner message={error.message} onDismiss={clearError} /> : null}
      <ChatInput
        value={input}
        busy={busy}
        onChange={setInput}
        onSubmit={() => submit(input)}
        onStop={stop}
      />
    </div>
  );
}
