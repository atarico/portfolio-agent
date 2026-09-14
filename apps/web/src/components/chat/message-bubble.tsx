import type { UIMessage } from "ai";

import { describeToolPart } from "@/lib/chat/tool-parts";

import { Markdown } from "./markdown";
import { ToolCallBadge } from "./tool-call-badge";

interface MessageBubbleProps {
  message: UIMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          isUser
            ? "max-w-[85%] rounded-2xl rounded-br-sm bg-zinc-900 px-4 py-2.5 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
            : "flex max-w-[85%] flex-col gap-2 rounded-2xl rounded-bl-sm border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
        }
      >
        {message.parts.map((part, index) => {
          const key = `${message.id}-${index}`;

          if (part.type === "text") {
            // Only the assistant's text is Markdown. The user's stays literal: it is what
            // they typed, and reformatting their own words back at them would be wrong -
            // a message about `**bold**` should read as they wrote it.
            return isUser ? (
              <p key={key} className="whitespace-pre-wrap text-[15px] leading-relaxed">
                {part.text}
              </p>
            ) : (
              <Markdown key={key}>{part.text}</Markdown>
            );
          }

          const tool = describeToolPart(part);
          if (tool) {
            return <ToolCallBadge key={key} tool={tool} />;
          }

          return null;
        })}
      </div>
    </div>
  );
}
