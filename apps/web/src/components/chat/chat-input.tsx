import { useEffect, useRef } from "react";

interface ChatInputProps {
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
}

export function ChatInput({ value, busy, onChange, onSubmit, onStop }: ChatInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus on load only with a precise pointer: on a touch screen it would open
  // the keyboard over the suggested questions before anyone asked for it.
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
  }, []);

  return (
    <form
      className="paper sticky bottom-0 z-10 -mx-4 px-4 pt-3 pb-5 sm:-mx-8 sm:px-8"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex items-center gap-2.5 rounded-lg border border-rule-strong bg-paper-raised p-1.5 pl-3.5 focus-within:border-signal focus-within:shadow-[0_0_0_3px_rgb(0_255_65/0.12),0_0_22px_-6px_rgb(0_255_65/0.45)]">
        <span aria-hidden className="glow shrink-0 font-bold text-signal">
          $
        </span>
        {/* Stays enabled while the agent works: disabling it would drop focus on every
            send, and the container already refuses a second question until this one ends. */}
        <input
          ref={inputRef}
          className="min-w-0 flex-1 bg-transparent py-2 text-base caret-signal outline-none placeholder:text-ink-faint focus-visible:outline-none"
          name="question"
          autoComplete="off"
          aria-label="Ask the portfolio agent"
          placeholder="Ask about a project, a stack, a README…"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {busy ? (
          <button
            type="button"
            className="rounded-md border border-rule-strong px-4 py-2.5 font-mono text-[12px] uppercase tracking-[0.12em] text-ink transition-colors hover:border-bad hover:text-bad"
            onClick={onStop}
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            className="rounded-md bg-signal px-4 py-2.5 font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-on-signal hover:shadow-[0_0_14px_rgb(0_255_65/0.45)] disabled:bg-rule disabled:font-normal disabled:text-ink-faint disabled:hover:shadow-none"
            disabled={!value.trim()}
          >
            Ask <span aria-hidden>↵</span>
          </button>
        )}
      </div>
      <p className="mt-2 hidden font-mono text-[10.5px] text-ink-faint sm:block">
        # Answers come from live GitHub data · every tool call is shown · the model that answered is named
      </p>
    </form>
  );
}
