interface EmptyStateProps {
  owner: string;
  onPick: (text: string) => void;
}

const SUGGESTIONS = [
  "Which projects are the most recent?",
  "What stack does the portfolio repo use?",
  "Which repositories use Supabase?",
  "Summarize the README of the biggest project.",
];

export function EmptyState({ owner, onPick }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-16 text-center">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold tracking-tight">Ask about {owner}&apos;s projects</h2>
        <p className="max-w-md text-sm text-zinc-500 dark:text-zinc-400">
          The agent reads live GitHub data through an MCP server. Every answer shows the tools it
          called.
        </p>
      </div>
      <ul className="grid w-full max-w-lg gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((suggestion) => (
          <li key={suggestion}>
            <button
              type="button"
              className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left text-sm hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
              onClick={() => onPick(suggestion)}
            >
              {suggestion}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
