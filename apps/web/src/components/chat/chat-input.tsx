interface ChatInputProps {
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
}

export function ChatInput({ value, busy, onChange, onSubmit, onStop }: ChatInputProps) {
  return (
    <form
      className="paper sticky bottom-0 z-10 -mx-4 px-4 pt-3 pb-5 sm:-mx-8 sm:px-8"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex items-center gap-2 rounded-2xl border border-rule-strong/70 bg-paper-raised p-1.5 pl-4 shadow-[0_16px_36px_-28px_rgb(0_0_0/0.5)] transition-colors focus-within:border-signal">
        <input
          className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-ink-faint focus-visible:outline-none"
          aria-label="Ask the portfolio agent"
          placeholder="Ask about a project, a stack, a README…"
          value={value}
          disabled={busy}
          autoFocus
          onChange={(event) => onChange(event.target.value)}
        />
        {busy ? (
          <button
            type="button"
            className="rounded-xl border border-rule px-4 py-2.5 font-mono text-[12px] uppercase tracking-[0.12em] text-ink hover:border-ink"
            onClick={onStop}
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            className="rounded-xl bg-signal px-4 py-2.5 font-mono text-[12px] uppercase tracking-[0.12em] text-on-signal transition-opacity hover:opacity-90 disabled:bg-rule disabled:text-ink-faint disabled:hover:opacity-100"
            disabled={!value.trim()}
          >
            Ask ↵
          </button>
        )}
      </div>
      <p className="mt-2 hidden font-mono text-[10.5px] text-ink-faint sm:block">
        Answers come from live GitHub data · every tool call is shown · the model that answered is named
      </p>
    </form>
  );
}
