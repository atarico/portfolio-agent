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
      className="sticky bottom-0 flex gap-2 border-t border-zinc-200 bg-zinc-50/95 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <input
        className="flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-[15px] outline-none placeholder:text-zinc-400 focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-400"
        placeholder="Ask about a project, a stack, a README…"
        value={value}
        disabled={busy}
        autoFocus
        onChange={(event) => onChange(event.target.value)}
      />
      {busy ? (
        <button
          type="button"
          className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          onClick={onStop}
        >
          Stop
        </button>
      ) : (
        <button
          type="submit"
          className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          disabled={!value.trim()}
        >
          Send
        </button>
      )}
    </form>
  );
}
